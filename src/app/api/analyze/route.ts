import { NextRequest, NextResponse } from "next/server";
import { replicate } from "@/lib/replicate";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt";

/// <reference types="node" />

export const runtime = "nodejs";

// Use globalThis to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

export async function POST(req: NextRequest) {
  const { transcript } = await req.json();
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    // Soft fallback when transcript is empty
    return NextResponse.json(buildFallback("Aucune transcription fournie."));
  }
  const model = processEnv.REPLICATE_LLM_MODEL || processEnv.REPLICATE_GPT5_MODEL || "openai/gpt-5";
  const system = buildSystemPrompt();
  const user = buildUserPrompt(transcript);

  try {
    // Many Replicate text models accept {prompt}, others accept {system_prompt, prompt}
    // We'll try a robust default and fall back if needed.
    const gpt5JsonHint = "Réponds UNIQUEMENT en JSON valide, sans texte additionnel.";
    const tryInputs = [
      // GPT-5 preferred shape
      { 
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${user}\n\n${gpt5JsonHint}` }
        ],
        verbosity: "low",
        reasoning_effort: "minimal",
        max_completion_tokens: 4000,
      },
      // Generic prompt shapes for broader compatibility (if env overrides model)
      { prompt: `${system}\n\n${user}\n\n${gpt5JsonHint}` },
      { system_prompt: system, prompt: `${user}\n\n${gpt5JsonHint}` },
      { messages: [ { role: "system", content: system }, { role: "user", content: user } ] },
      { input: `${system}\n\n${user}` },
    ];

    let lastErr: any = null;
    for (const input of tryInputs) {
      try {
        const prediction = await replicate.predictions.create({
          model,
          input
        } as any);

        if (prediction.status !== "succeeded") {
          let p = prediction as any;
          // poll up to ~60s
          for (let i=0; i<30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            p = await replicate.predictions.get(prediction.id);
            if (p.status === "succeeded") break;
            if (p.status === "failed" || p.status === "canceled") throw new Error("LLM prediction failed");
          }
          if (p.status !== "succeeded") throw new Error("Timeout waiting for LLM");
          const out = p.output;
          const text = Array.isArray(out) ? out.join("\n") : (out?.text || out);
          const raw = String(text || "").trim();
          const parsed = safeParseJson(raw);
          if (parsed) return NextResponse.json(parsed);
          
          // Try JSON repair model
          const repaired = await repairJsonWithModel(raw);
          if (repaired) return NextResponse.json(repaired);
          
          // Fallback: return as draft so UI and TTS still work
          return NextResponse.json(buildFallback(raw));
        }

        const out = (prediction as any).output;
        const text = Array.isArray(out) ? out.join("\n") : (out?.text || out);
        const raw = String(text || "").trim();
        
        // DEBUG: Log raw LLM output to identify formatting issues
        console.log("=== RAW LLM OUTPUT DEBUG ===");
        console.log("Raw text length:", raw.length);
        console.log("Raw text (first 500 chars):", JSON.stringify(raw.slice(0, 500)));
        console.log("Contains spaced words:", /\b\w\s+\w\b/.test(raw));
        console.log("Contains spaced JSON keys:", /task\s+_\s*understanding|detailed\s+_\s*plan/.test(raw));
        console.log("===========================");
        
        // Try to parse JSON directly first
        const parsed = safeParseJson(raw);
        if (parsed) {
          // Validate and fix each field if needed
          const validated = await validateAndFixFields(parsed);
          return NextResponse.json(validated);
        }
        
        // If parsing fails, use the JSON repair model
        console.log("Direct parsing failed, trying JSON repair model...");
        const repaired = await repairJsonWithModel(raw);
        if (repaired) {
          // Validate and fix each field if needed
          const validated = await validateAndFixFields(repaired);
          return NextResponse.json(validated);
        }
        
        // Final fallback
        return NextResponse.json(buildFallback(raw));
      } catch (e) {
        lastErr = e;
        continue;
      }
    }
    // If all patterns failed catastrophically, signal error
    throw lastErr || new Error("All LLM input patterns failed");
  } catch (e: any) {
    console.error(e);
    // Soft-fail: return a fallback so UI and TTS can proceed
    const msg = typeof e?.message === "string" ? e.message : "Analysis error";
    return NextResponse.json(buildFallback(`Analyse indisponible: ${msg}`));
  }
}

function safeParseJson(text: string): null | {
  task_understanding: string;
  introduction: string;
  detailed_plan: string;
  conclusion: string;
  draft: string;
} {
  try {
    const obj = JSON.parse(text);
    if (
      obj &&
      typeof obj.task_understanding === "string" &&
      typeof obj.introduction === "string" &&
      typeof obj.detailed_plan === "string" &&
      typeof obj.conclusion === "string" &&
      typeof obj.draft === "string"
    ) {
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}


async function validateAndFixFields(obj: any): Promise<any> {
  console.log("🔍 Validating fields for formatting issues...");
  
  const result = { ...obj };
  const fieldsToCheck = ["task_understanding", "introduction", "detailed_plan", "conclusion", "draft"];
  
  for (const field of fieldsToCheck) {
    if (result[field] && typeof result[field] === "string") {
      const text = result[field];
      
      // Quick check for obvious problems
      if (/\b\w\s+\w\b/.test(text) || /[àâäéèêëïîôùûüÿç]\s+[a-z]/i.test(text)) {
        console.log(`⚠️ Field '${field}' has formatting issues, sending to validation API...`);
        
        try {
          // Use GPT-5 directly to fix the text
          const fixModel = processEnv.REPLICATE_GPT5_MODEL || "openai/gpt-5";
          const fixPrompt = `Ce texte français a des espaces dans les mots. Corrige-le et retourne UNIQUEMENT le texte corrigé.

Exemple: "L'é non cé demande une analy se" → "L'énoncé demande une analyse"

Texte à corriger:
${text}

Texte corrigé:`;

          const fixPrediction = await replicate.predictions.create({
            model: fixModel,
            input: {
              prompt: fixPrompt,
              verbosity: "low",
              reasoning_effort: "minimal",
              max_completion_tokens: 1000
            }
          } as any);

          let p = fixPrediction as any;
          if (p.status !== "succeeded") {
            for (let i = 0; i < 20; i++) {
              await new Promise(r => setTimeout(r, 1500));
              p = await replicate.predictions.get(fixPrediction.id);
              if (p.status === "succeeded") break;
              if (p.status === "failed" || p.status === "canceled") break;
            }
          }

          if (p.status === "succeeded" && p.output) {
            const corrected = Array.isArray(p.output) ? p.output.join("") : p.output;
            result[field] = corrected.trim();
            console.log(`✅ Field '${field}' corrected`);
          }
        } catch (e) {
          console.error(`Failed to fix field ${field}:`, e);
        }
      }
    }
  }
  
  return result;
}

async function repairJsonWithModel(raw: string): Promise<any | null> {
  try {
    console.log("🔧 Attempting JSON repair with intelligent-utilities/repair-json");
    
    const repairModel = processEnv.REPLICATE_JSON_REPAIR_MODEL || "intelligent-utilities/repair-json";
    const repairPrediction = await replicate.predictions.create({
      model: repairModel,
      input: { text: raw }
    } as any);

    let p = repairPrediction as any;
    if (p.status !== "succeeded") {
      // Poll for completion (shorter timeout for JSON repair)
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        p = await replicate.predictions.get(repairPrediction.id);
        if (p.status === "succeeded") break;
        if (p.status === "failed" || p.status === "canceled") {
          console.error("❌ JSON repair failed:", p.error);
          return null;
        }
      }
    }

    if (p.status === "succeeded" && p.output) {
      console.log("✅ JSON repair successful");
      const repairedJson = p.output;
      
      // Validate that the repaired JSON has our expected structure
      if (typeof repairedJson === "object" && 
          typeof repairedJson.task_understanding === "string" &&
          typeof repairedJson.introduction === "string" &&
          typeof repairedJson.detailed_plan === "string" &&
          typeof repairedJson.conclusion === "string" &&
          typeof repairedJson.draft === "string") {
        return repairedJson;
      }
    }
    
    console.log("❌ JSON repair did not produce expected structure");
    return null;
  } catch (error: any) {
    console.error("❌ JSON repair model error:", error.message);
    return null;
  }
}

function buildFallback(raw: string) {
  return {
    task_understanding: "",
    introduction: "",
    detailed_plan: "",
    conclusion: "",
    draft: raw.trim(),
  };
}
