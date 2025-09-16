import { NextRequest, NextResponse } from "next/server";
import { replicate } from "@/lib/replicate";

export const runtime = "nodejs";

const processEnv = (globalThis as any).process?.env || {};

export async function POST(req: NextRequest) {
  try {
    const { text, field } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    console.log("=== VALIDATE API ===");
    console.log("Field:", field);
    console.log("Text length:", text.length);
    console.log("Sample:", text.slice(0, 100));

    // Use GPT-5 (or override) to check if text has formatting issues
    const model = processEnv.REPLICATE_VALIDATION_MODEL || processEnv.REPLICATE_GPT5_MODEL || "openai/gpt-5";
    
    const validationPrompt = `Examine this French text and answer with YES or NO only:
Does this text have formatting problems like spaces inside words (e.g. "L'é non cé" instead of "L'énoncé")?

Text to examine:
${text}

Answer (YES/NO):`;

    const prediction = await replicate.predictions.create({
      model,
      input: {
        prompt: validationPrompt,
        verbosity: "low",
        reasoning_effort: "minimal",
        max_completion_tokens: 20
      }
    } as any);

    let p = prediction as any;
    if (p.status !== "succeeded") {
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        p = await replicate.predictions.get(prediction.id);
        if (p.status === "succeeded") break;
        if (p.status === "failed" || p.status === "canceled") {
          throw new Error("Validation failed");
        }
      }
    }

    const response = Array.isArray(p.output) ? p.output.join("") : p.output;
    const hasProblems = response.toUpperCase().includes("YES");
    
    console.log("Validation result:", hasProblems ? "HAS PROBLEMS" : "OK");

    // If problems detected, use GPT-5 to reformat
    if (hasProblems) {
      console.log("🔧 Text has problems, reformatting with GPT-5...");
      
      const reformatModel = processEnv.REPLICATE_GPT5_MODEL || "openai/gpt-5";
      const reformatPrompt = `Fix this French text that has spaces inside words. Return ONLY the corrected text, nothing else.

Example of problem: "L'é non cé demande une analy se" 
Should become: "L'énoncé demande une analyse"

Text to fix:
${text}

Corrected text:`;

      const reformatPrediction = await replicate.predictions.create({
        model: reformatModel,
        input: {
          prompt: reformatPrompt,
          verbosity: "low",
          reasoning_effort: "minimal",
          max_completion_tokens: 1000
        }
      } as any);

      let rp = reformatPrediction as any;
      if (rp.status !== "succeeded") {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          rp = await replicate.predictions.get(reformatPrediction.id);
          if (rp.status === "succeeded") break;
          if (rp.status === "failed" || rp.status === "canceled") {
            console.error("Reformat failed");
            return NextResponse.json({ 
              isValid: false, 
              hasProblems: true,
              correctedText: text 
            });
          }
        }
      }

      const corrected = Array.isArray(rp.output) ? rp.output.join("") : rp.output;
      console.log("✅ Text reformatted successfully");
      
      return NextResponse.json({ 
        isValid: true,
        hasProblems: true,
        correctedText: corrected.trim()
      });
    }

    return NextResponse.json({ 
      isValid: true,
      hasProblems: false,
      correctedText: text
    });
    
  } catch (e: any) {
    console.error("❌ VALIDATE ERROR:", e);
    return NextResponse.json({ error: e?.message || "Validation error" }, { status: 500 });
  }
}
