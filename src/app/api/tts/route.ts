import { NextRequest, NextResponse } from "next/server";
import { replicate } from "@/lib/replicate";
import { getSupabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabaseServer";
import { prepareTextForTts } from "@/lib/textFormat";

export const runtime = "nodejs";

// Use globalThis to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    const model = processEnv.REPLICATE_TTS_MODEL || "minimax/speech-02-turbo";
    // Prefer a native French narrator voice if env not set
    const voice = processEnv.MINIMAX_TTS_VOICE || "French_MaleNarrator";
    const fallbackFormat = processEnv.MINIMAX_TTS_FORMAT || "mp3";
    const speed = Number(processEnv.MINIMAX_TTS_SPEED || 1);
    const volume = Number(processEnv.MINIMAX_TTS_VOLUME || 1);
    const pitch = Number(processEnv.MINIMAX_TTS_PITCH || 0);

    const prepped = prepareTextForTts(text);

    // Many TTS models on Replicate return an audio URL in output[0] or output.audio
    const prediction = await replicate.predictions.create({
      model,
      input: {
        text: prepped,
        voice_id: voice,
        speed,
        volume,
        pitch,
        sample_rate: 32000,
        bitrate: 128000,
        channel: "mono",
        english_normalization: false,
        language_boost: "French"
      } as Record<string, unknown>
    } as any);

    let p = prediction as any;
    if (p.status !== "succeeded") {
      for (let i=0; i<30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        p = await replicate.predictions.get(prediction.id);
        if (p.status === "succeeded") break;
        if (p.status === "failed" || p.status === "canceled") throw new Error("TTS failed");
      }
    }
    const out = p.output;
    let audioUrl: string | undefined = undefined;
    if (Array.isArray(out) && out.length) audioUrl = out[0];
    else if (typeof out === "string") audioUrl = out;
    else if (out?.audio) audioUrl = out.audio;

    if (!audioUrl) {
      return NextResponse.json({ error: "No audio URL from TTS" }, { status: 500 });
    }

    // Optionally, proxy the audio into Supabase for stable hosting
    const res = await fetch(audioUrl);
    if (!res.ok) {
      // if fetching fails, just return the original URL
      return NextResponse.json({ audioUrl });
    }
    try {
      const buf = Buffer.from(await res.arrayBuffer());

      // Preserve the original audio format when uploading to Supabase
      const headerContentType = res.headers.get("content-type") || "";
      const urlPath = (() => {
        try {
          const u = new URL(audioUrl);
          return u.pathname.toLowerCase();
        } catch {
          return String(audioUrl || "").split("?")[0].toLowerCase();
        }
      })();
      const extFromUrl = (() => {
        const match = urlPath.match(/\.([a-z0-9]+)$/i);
        return match ? match[1] : "";
      })();
      const extFromHeader = (() => {
        if (headerContentType.startsWith("audio/")) {
          return headerContentType.replace("audio/", "").split(";")[0].trim();
        }
        return "";
      })();
      const uploadExt = (extFromHeader || extFromUrl || fallbackFormat).replace(/[^a-z0-9]/g, "");
      const uploadContentType = headerContentType && headerContentType.startsWith("audio/")
        ? headerContentType
        : `audio/${uploadExt || "mpeg"}`;

      const filename = `tts/${Date.now()}-${Math.random().toString(36).slice(2)}.${uploadExt || "mp3"}`;
      const supabaseAdmin = getSupabaseAdmin();
      const { error } = await supabaseAdmin.storage.from(SUPABASE_BUCKET).upload(filename, buf, {
        contentType: uploadContentType
      });
      if (error) {
        console.warn("Supabase upload for TTS failed, falling back to direct URL", error);
        return NextResponse.json({ audioUrl });
      }
      const { data: pub } = supabaseAdmin.storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
      // Provide a signed URL to ensure playback even if bucket is private
      const { data: signed } = await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(filename, 60 * 60); // 1 hour
      return NextResponse.json({ audioUrl: signed?.signedUrl || pub.publicUrl });
    } catch (e) {
      console.warn("Supabase unavailable or misconfigured, returning direct Replicate URL", e);
      return NextResponse.json({ audioUrl });
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "TTS error" }, { status: 500 });
  }
}

// moved to lib/textFormat.ts
