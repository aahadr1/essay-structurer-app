// Use globalThis to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

export function buildSystemPrompt() {
  const base = processEnv.SYSTEM_PROMPT_TEXT?.trim() || "";
  return base;
}

export function buildUserPrompt(transcript: string) {
  // Updated to request a French, JSON-structured output: intro, detailed plan, conclusion, and a full draft.
  return `
Tu reçois la transcription brute (français) d'un élève qui lit et explique son sujet et ses consignes. Ta mission est de comprendre précisément la tâche demandée et de produire un plan d'essai complet en français.

Exigeances:
- Distingue ce qui est pertinent pour la tâche de ce qui ne l'est pas. Ignore le bruit.
- Propose un plan détaillé en trois parties avec sous-parties (I/II/III, A/B, 1/2) et les mouvements rhétoriques.
- Rédige aussi: une introduction très précise (sans blabla), et une conclusion courte qui répond clairement.
- Fournis en plus un "brouillon" de texte complet qui sera lu par TTS, en français clair, en un seul paragraphe continu (sans listes, sans puces, sans Markdown, sans retours à la ligne inutiles). Ne limite pas la longueur artificiellement.
- Utilise des crochets [A REMPLIR] pour les éléments spécifiques à compléter par l'élève (dates, notions, exemples, sources).
- Si le type d'exercice n'est pas clair, fais une hypothèse explicite.

Répond STRICTEMENT en JSON valide UTF-8, sans texte additionnel, avec ce schéma exact. 

FORMATAGE CRITIQUE: 
- Écris le texte français NORMALEMENT avec des espaces entre les mots
- NE sépare JAMAIS les caractères d'un mot par des espaces
- Exemple CORRECT: "L'énoncé demande une analyse"
- Exemple INCORRECT: "L ' é n o n c é   d e m a n d e   u n e   a n a l y s e"
- Exemple INCORRECT: "L'énoncédemandeuneanalyse" (mots collés)

Schéma JSON:
{
  "task_understanding": "string",             // 2–4 phrases, ce que l'énoncé demande et contraintes
  "introduction": "string",                   // Intro précise: amorce brève, définition/situation, problématique, annonce du plan
  "detailed_plan": "string",                 // Plan hiérarchisé I/II/III avec A/B/1/2, en puces directives
  "conclusion": "string",                    // Bilan + réponse + ouverture (1–3 phrases)
  "draft": "string"                          // Brouillon lisible par TTS, français, 1 seul paragraphe, sans listes
}

Transcription de l'élève (verbatim):
---
${transcript}
---
`.trim();
}
