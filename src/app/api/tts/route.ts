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

    // Chunk long text into manageable pieces to avoid model limits
    const chunks = chunkTextForTts(prepped, 1400);

    // Many TTS models on Replicate return an audio URL in output[0] or output.audio
    // Generate audio for each chunk and upload to Supabase
    const uploadedUrls: string[] = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const piece = chunks[idx];
      const audioUrl = await generateTtsAudioUrl(model, piece, { voice, speed, volume, pitch });
      if (!audioUrl) continue;

      const res = await fetch(audioUrl);
      if (!res.ok) {
        uploadedUrls.push(audioUrl);
        continue;
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

        const filename = `tts/${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}.${uploadExt || "mp3"}`;
        const supabaseAdmin = getSupabaseAdmin();
        const { error } = await supabaseAdmin.storage.from(SUPABASE_BUCKET).upload(filename, buf, {
          contentType: uploadContentType
        });
        if (error) {
          console.warn("Supabase upload for TTS chunk failed, falling back to direct URL", error);
          uploadedUrls.push(audioUrl);
        } else {
          const { data: pub } = supabaseAdmin.storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
          const { data: signed } = await supabaseAdmin.storage
            .from(SUPABASE_BUCKET)
            .createSignedUrl(filename, 60 * 60); // 1 hour
          uploadedUrls.push(signed?.signedUrl || pub.publicUrl);
        }
      } catch (e) {
        console.warn("Supabase unavailable or misconfigured for TTS chunk, returning direct Replicate URL", e);
        uploadedUrls.push(audioUrl);
      }
    }

    if (uploadedUrls.length === 0) {
      return NextResponse.json({ error: "No audio generated" }, { status: 500 });
    }

    return NextResponse.json(uploadedUrls.length === 1 ? { audioUrl: uploadedUrls[0] } : { audioUrls: uploadedUrls });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "TTS error" }, { status: 500 });
  }
}

// moved to lib/textFormat.ts

function chunkTextForTts(input: string, maxLen: number): string[] {
  const s = String(input || "").trim();
  if (!s) return [];
  if (s.length <= maxLen) return [s];
  const sentences = s.split(/(?<=[.!?…])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sent of sentences) {
    if ((current + (current ? " " : "") + sent).length <= maxLen) {
      current = current ? current + " " + sent : sent;
    } else {
      if (current) chunks.push(current);
      if (sent.length <= maxLen) {
        current = sent;
      } else {
        // Hard wrap very long sentences
        for (let i = 0; i < sent.length; i += maxLen) {
          chunks.push(sent.slice(i, i + maxLen));
        }
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function generateTtsAudioUrl(model: string, text: string, opts: { voice: string; speed: number; volume: number; pitch: number; }): Promise<string | null> {
  const { voice, speed, volume, pitch } = opts;
  const ttsInputs = [
    { text, voice_id: voice, speed, volume, pitch, sample_rate: 32000, bitrate: 128000, channel: "mono", english_normalization: false, language_boost: "French" },
    { text, voice: voice, speed, volume, pitch },
    { prompt: text, voice_id: voice },
    { input: text, voice_id: voice }
  ] as Array<Record<string, unknown>>;

  let prediction: any = null;
  for (let i = 0; i < ttsInputs.length; i++) {
    try {
      prediction = await replicate.predictions.create({ model, input: ttsInputs[i] } as any);
      break;
    } catch (e: any) {
      // try next shape
      continue;
    }
  }
  if (!prediction) return null;

  let p = prediction as any;
  if (p.status !== "succeeded") {
    for (let i=0; i<30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      p = await replicate.predictions.get(prediction.id);
      if (p.status === "succeeded") break;
      if (p.status === "failed" || p.status === "canceled") return null;
    }
  }
  const out = p.output;
  if (Array.isArray(out) && out.length) return out[0];
  if (typeof out === "string") return out;
  if (out?.audio) return out.audio;
  return null;
}
