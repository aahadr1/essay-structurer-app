import { NextRequest, NextResponse } from "next/server";
import { replicate } from "@/lib/replicate";

export const runtime = "nodejs";

// Use globalThis to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    console.log("=== REFORMAT API DEBUG ===");
    console.log("Input text length:", text.length);
    console.log("Input text (first 200 chars):", text.slice(0, 200));

    const model = processEnv.REPLICATE_GPT5_MODEL || "openai/gpt-5";
    
    const systemPrompt = `Tu es un expert en formatage de texte français pour synthèse vocale (TTS). 

Ton rôle est de prendre du texte qui peut contenir des erreurs de formatage (espaces mal placés, caractères cassés, etc.) et de le reformater parfaitement pour qu'il soit lu naturellement par un système TTS français.

Règles importantes :
1. Corrige tous les problèmes d'espacement et de caractères cassés
2. Assure-toi que tous les mots français sont correctement écrits
3. Utilise une ponctuation appropriée pour la lecture vocale
4. Garde le sens et le contenu original intact
5. Produis un texte fluide et naturel pour la lecture à voix haute
6. Évite les abréviations, écris les mots en entier
7. Assure-toi que les phrases sont bien structurées

Réponds UNIQUEMENT avec le texte reformaté, sans commentaires ni explications.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Reformate ce texte pour qu'il soit parfait pour la synthèse vocale française :\n\n${text}` }
    ];

    console.log("🤖 Calling GPT-5 for text reformatting...");

    const prediction = await replicate.predictions.create({
      model,
      input: {
        messages,
        verbosity: "low",
        reasoning_effort: "low",
        max_completion_tokens: 1000
      }
    } as any);

    let p = prediction as any;
    if (p.status !== "succeeded") {
      // Poll for completion
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        p = await replicate.predictions.get(prediction.id);
        console.log(`Reformat poll ${i + 1}/30: status=${p.status}`);
        if (p.status === "succeeded") break;
        if (p.status === "failed" || p.status === "canceled") {
          console.error("❌ GPT-5 reformat failed:", p.error);
          throw new Error("GPT-5 reformatting failed");
        }
      }
    }

    if (p.status === "succeeded" && p.output) {
      // GPT-5 returns an array of strings, join them
      const reformattedText = Array.isArray(p.output) ? p.output.join("") : p.output;
      console.log("✅ GPT-5 reformat successful");
      console.log("Output text length:", reformattedText.length);
      console.log("Output text (first 200 chars):", reformattedText.slice(0, 200));
      
      return NextResponse.json({ 
        reformattedText: reformattedText.trim() 
      });
    }

    throw new Error("GPT-5 did not return expected output");
    
  } catch (e: any) {
    console.error("❌ REFORMAT ERROR:", e);
    return NextResponse.json({ error: e?.message || "Reformat error" }, { status: 500 });
  }
}

