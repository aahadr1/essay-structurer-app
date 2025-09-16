import { NextRequest, NextResponse } from "next/server";
import { replicate } from "@/lib/replicate";

export const runtime = "nodejs";

// Use globalThis to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

export async function POST(req: NextRequest) {
  console.log("=== TRANSCRIBE API DEBUG ===");
  
  let audioUrl: string;
  let modelSlug: string | undefined;
  let version: string | undefined;
  
  try {
    const body = await req.json();
    audioUrl = body?.audioUrl as string | undefined;
    console.log("Received audioUrl:", audioUrl ? "✓" : "✗", audioUrl?.slice(0, 100));
    
    if (!audioUrl) return NextResponse.json({ error: "Missing audioUrl" }, { status: 400 });

    // Check if Replicate API token is configured
    const replicateToken = processEnv.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      console.error("❌ REPLICATE_API_TOKEN not configured");
      return NextResponse.json({ error: "Replicate API not configured" }, { status: 500 });
    }
    console.log("Replicate token:", replicateToken ? "✓ configured" : "✗ missing");

    const modelEnv = processEnv.REPLICATE_WHISPER_MODEL || "";
    modelSlug = modelEnv || undefined;
    if (modelEnv.includes(":")) {
      const [slug, ver] = modelEnv.split(":", 2);
      modelSlug = slug || undefined;
      version = ver || undefined;
    }
    console.log("Using model from env:", modelSlug || "<none>", version ? `version: ${version}` : "latest");
  } catch (parseError) {
    console.error("❌ Failed to parse request body:", parseError);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    // Prepare model candidates: env first, then known stable fallbacks
    const modelCandidates: Array<{ slug?: string; version?: string }> = [];
    if (modelSlug || version) modelCandidates.push({ slug: modelSlug, version });
    // Fallbacks: try known openai whisper identifiers without pinned version
    modelCandidates.push({ slug: "openai/whisper-large-v3" });
    modelCandidates.push({ slug: "openai/whisper" });

    // Try multiple input shapes accepted by different Whisper builds
    const inputsList = [
      { audio: audioUrl, task: "transcribe", language: "fr", translate: false, temperature: 0 },
      { audio_url: audioUrl, task: "transcribe", language: "fr", translate: false, temperature: 0 },
      { file_url: audioUrl, task: "transcribe", language: "fr", translate: false, temperature: 0 },
    ];

    const maxPolls = Number(processEnv.TRANSCRIBE_MAX_POLLS || 25); // ~50s
    let lastErrorMessage = "";
    let lastReplicateError: any = null;

    for (let m = 0; m < modelCandidates.length; m++) {
      const mCand = modelCandidates[m];
      console.log(`🎯 Trying model ${m + 1}/${modelCandidates.length}:`, mCand.slug || "<version-only>", mCand.version || "latest");
      for (let i = 0; i < inputsList.length; i++) {
        const input = inputsList[i];
        console.log(`🔄 Trying input format ${i + 1}/${inputsList.length}:`, Object.keys(input));
        try {
          const createArgs: any = { input };
          if (mCand.version) createArgs.version = mCand.version; else if (mCand.slug) createArgs.model = mCand.slug;

          console.log("Creating prediction with args:", { model: createArgs.model, version: createArgs.version, inputKeys: Object.keys(input) });

          const prediction = await replicate.predictions.create(createArgs);
          console.log("Prediction created:", prediction.id, "status:", prediction.status);

          let p: any = prediction;
          if (p.status !== "succeeded") {
            console.log("⏳ Waiting for prediction to complete...");
            for (let j = 0; j < maxPolls; j++) {
              await new Promise(r => setTimeout(r, 2000));
              p = await replicate.predictions.get(prediction.id);
              console.log(`Poll ${j + 1}/${maxPolls}: status=${p.status}`);
              if (p.status === "succeeded") break;
              if (p.status === "failed" || p.status === "canceled") {
                console.error("❌ Prediction failed:", p.error || p.status);
                lastReplicateError = p.error || p.status;
                break;
              }
            }
          }

          if (p.status === "succeeded") {
            const transcript = normalizeWhisperOutput(p?.output);
            console.log("✅ Transcript received:", transcript ? `${transcript.length} chars` : "empty");
            if (typeof transcript === "string" && transcript.trim().length > 5) {
              console.log("=== TRANSCRIBE SUCCESS ===");
              return NextResponse.json({ transcript: transcript.trim() });
            }
          } else {
            console.log("❌ Prediction final status:", p.status, p.error);
            lastReplicateError = p.error || p.status;
          }
        } catch (inputError: any) {
          const msg = String(inputError?.message || inputError || "Unknown error");
          lastErrorMessage = msg;
          console.error(`❌ Input format ${i + 1} failed:`, msg);
          // continue to next input or model
        }
      }
    }

    console.error("❌ All input formats failed", { lastErrorMessage, lastReplicateError });
    return NextResponse.json({ error: "All transcription formats failed", details: String(lastReplicateError || lastErrorMessage || "")?.slice(0, 400) }, { status: 502 });
  } catch (e: any) {
    console.error("❌ TRANSCRIBE ERROR:", e);
    return NextResponse.json({ error: e?.message || "Transcription error" }, { status: 500 });
  }
}

function normalizeWhisperOutput(out: any): string {
  if (!out) return "";
  if (typeof out === "string") return out;
  if (Array.isArray(out)) return out.join("\n");
  if (out?.text) return String(out.text);
  // Some variants return { segments: [...], text: "..." } or { transcription: "..." }
  if (out?.transcription) return String(out.transcription);
  return "";
}
