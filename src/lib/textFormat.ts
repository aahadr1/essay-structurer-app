// Surgical fix: Strip invisible Unicode characters that cause syllabification
export function stripInvisibles(input: string): string {
  let s = String(input || "");

  // Convert NBSP to normal space (helps TeX and JSON parsing)
  s = s.replace(/\u00A0/g, " ");

  // Remove zero-width / soft-hyphen / word-joiner / BOM / line+para sep
  s = s.replace(/[\u200B-\u200D\u2060\u00AD\uFEFF\u2028\u2029]/g, "");

  // Normalize accents to NFC (é instead of e + ́)
  s = s.normalize("NFC");

  return s;
}

// Optional: tighten obvious splits like "201 4" or "l ' institution"
export function tightenObviousSplits(s: string): string {
  if (!s) return s;
  s = s.replace(/(\d)\s+(?=\d)/g, "$1");        // 201 4 -> 2014
  s = s.replace(/\s+([''])/g, "$1");            // l ' -> l'
  s = s.replace(/([''])\s+/g, "$1");            // l' institution -> l'institution
  return s;
}

export function normalizeFrenchProse(input: string): string {
  let s = tightenObviousSplits(stripInvisibles(String(input || "")));
  
  // Basic cleanup only - let LLM handle proper formatting
  
  // Strip code fences and HTML tags that might confuse TTS
  s = s.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ");
  
  // Remove bullet/number markers at line starts for TTS
  s = s.replace(/^\s*(?:[-*•·>]+\s*)/gm, "");
  s = s.replace(/^\s*(?:[IVXLCM]+\.|[A-Z]\.|\d+\.|\d+\)|\([a-zA-Z0-9]+\))\s*/gm, "");
  
  // Normalize whitespace for TTS
  s = s.replace(/\r/g, "");
  s = s.replace(/\n{2,}/g, ". ");
  s = s.replace(/\n/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  
  // Basic punctuation spacing for TTS
  s = s.replace(/\s+([,;:.!?…])/g, "$1");
  
  // Ensure ends with punctuation for prosody
  if (s && !/[.!?…]$/.test(s)) s += ".";
  
  // Clip to safe length for TTS
  if (s.length > 4900) s = s.slice(0, 4900);
  
  return s;
}

export function prepareTextForTts(input: string): string {
  let s = tightenObviousSplits(stripInvisibles(String(input || "")));
  
  // Minimal processing for TTS - only essential cleanup
  // Remove technical control tokens that would confuse TTS
  s = s.replace(/<#[0-9.]+#>/g, "");
  
  // Make placeholders neutral for speech
  s = s.replace(/\[([^\]]+)\]/g, "($1)");
  
  // Only basic whitespace normalization for TTS
  s = s.replace(/\s+/g, " ").trim();
  
  return s;
}

export function fixTokenizedText(input: string): string {
  // Make this a no-surprises cleaner; don't strip braces/quotes aggressively
  let s = stripInvisibles(String(input || "")).trim();

  // If you still want to remove a leading label like "introduction: ..."
  s = s.replace(
    /^\s*(task_understanding|introduction|detailed_plan|conclusion|draft)\s*['":\s]*/i,
    ""
  );
  return s;
}

export function fixPdfExtractionSpacing(input: string): string {
  let s = String(input || "");
  
  // Fix ciblé pour les séparations PDF typiques observées
  
  // 1. Fix les clés JSON cassées: "task _understanding" -> "task_understanding"
  s = s.replace(/\b(task|detailed|conclusion|introduction|draft)\s+(_\s*\w+)/g, "$1$2");
  
  // 2. Fix les chiffres clairement cassés: "201 3" -> "2013"
  s = s.replace(/(\d{1,4})\s+(\d{1,4})/g, "$1$2");
  
  // 3. Fix les apostrophes et traits d'union: "l ' institution" -> "l'institution", "g ère -t - elle" -> "gère-t-elle"
  s = s.replace(/\s+([''])/g, "$1").replace(/([''])\s+/g, "$1");
  s = s.replace(/\s*-\s*t\s*-\s*/g, "-t-");
  s = s.replace(/(\w)\s+-\s+(\w)/g, "$1-$2");
  
  // 4. Fix les mots français communs cassés par PDF (patterns étendus)
  // Mots de base
  s = s.replace(/\bL['']é\s+non\s+cé\b/g, "L'énoncé");
  s = s.replace(/\binvest\s+isse\s+ments?\b/g, "investissements");
  s = s.replace(/\bC\s+ais\s+se\b/g, "Caisse");
  s = s.replace(/\bstrat\s+ég\s+ie\s?s?\b/g, "stratégies");
  s = s.replace(/\bexpl\s+iqu\s+ant\b/g, "expliquant");
  s = s.replace(/\bexpl\s+iquer\b/g, "expliquer");
  s = s.replace(/\bdéc\s+isions?\b/g, "décisions");
  s = s.replace(/\bpr\s+ises?\b/g, "prises");
  s = s.replace(/\bg\s+ère\b/g, "gère");
  s = s.replace(/\bg\s+érer\b/g, "gérer");
  s = s.replace(/\bact\s+ifs?\b/g, "actifs");
  s = s.replace(/\bmé\s+can\s+ism\s+es?\b/g, "mécanismes");
  s = s.replace(/\bde\s*la\s*C\s+ais\s+se/g, "de la Caisse");
  s = s.replace(/\bDep\s+uis\b/g, "Depuis");
  s = s.replace(/\bint\s+roduction\b/g, "introduction");
  s = s.replace(/\bd\s+etailed\b/g, "detailed");
  s = s.replace(/\bcon\s+clusion\b/g, "conclusion");
  
  // Nouveaux patterns identifiés
  s = s.replace(/\bdép\s+ô\s+ts?\b/g, "dépôts");
  s = s.replace(/\bident\s+ifiant\b/g, "identifiant");
  s = s.replace(/\bop\s+ération\s+nels?\b/g, "opérationnels");
  s = s.replace(/\bfinancière?\s+pub\s+lique\b/g, "financière publique");
  s = s.replace(/\bconsid\s+ér\s+ables?\b/g, "considérables");
  s = s.replace(/\bconn\s+u\b/g, "connu");
  s = s.replace(/\bé\s+vol\s+utions?\b/g, "évolutions");
  s = s.replace(/\bnot\s+ables?\b/g, "notables");
  s = s.replace(/\bét\s+ude\b/g, "étude");
  s = s.replace(/\bv\s+ise\b/g, "vise");
  s = s.replace(/\banaly\s+ser\b/g, "analyser");
  s = s.replace(/\bm\s+ises?\b/g, "mises");
  s = s.replace(/\bContext\s+ual\s+isation\b/g, "Contextualisation");
  s = s.replace(/\br\s+ôle\b/g, "rôle");
  s = s.replace(/\bl['']é\s+conom\s+ie\b/g, "l'économie");
  s = s.replace(/\bPr\s+és\s+ent\s+ation\b/g, "Présentation");
  s = s.replace(/\bR\s+ôle\b/g, "Rôle");
  s = s.replace(/\bObject\s+ifs?\b/g, "Objectifs");
  s = s.replace(/\bÉ\s+volution\b/g, "Évolution");
  s = s.replace(/\bChang\s+ements?\b/g, "Changements");
  s = s.replace(/\bNou\s+vel\s+les?\b/g, "Nouvelles");
  s = s.replace(/\bRé\s+organisation\b/g, "Réorganisation");
  s = s.replace(/\bFact\s+eurs?\b/g, "Facteurs");
  s = s.replace(/\bcl\s+és?\b/g, "clés");
  s = s.replace(/\binflu\s+en\s+ç\s+ant\b/g, "influençant");
  s = s.replace(/\bcontext\s+e\b/g, "contexte");
  s = s.replace(/\béconom\s+ique\b/g, "économique");
  s = s.replace(/\brég\s+lement\s+ations?\b/g, "réglementations");
  s = s.replace(/\bnorm\s+es?\b/g, "normes");
  s = s.replace(/\bAnaly\s+se\b/g, "Analyse");
  s = s.replace(/\ben\s+je\s+ux\b/g, "enjeux");
  s = s.replace(/\bBil\s+an\b/g, "Bilan");
  s = s.replace(/\bEn\s+je\s+ux\b/g, "Enjeux");
  s = s.replace(/\bl['']aven\s+ir\b/g, "l'avenir");
  s = s.replace(/\bcro\s+issance\b/g, "croissance");
  s = s.replace(/\bRis\s+ques?\b/g, "Risques");
  s = s.replace(/\bdéf\s+is?\b/g, "défis");
  s = s.replace(/\bmaje\s+urs?\b/g, "majeurs");
  s = s.replace(/\bcomprend\s+re\b/g, "comprendre");
  
  // 5. Fix générique pour patterns courants non couverts
  // Patterns génériques pour les séquences de 2-3 syllabes cassées
  s = s.replace(/\b([a-zàâäéèêëïîôùûüÿç]{2,4})\s+([a-zàâäéèêëïîôùûüÿç]{2,4})\s+([a-zàâäéèêëïîôùûüÿç]{2,4})\b/gi, 
    (match, p1, p2, p3) => {
      // Évite de coller les vrais mots (ex: "la gestion des" ne doit pas devenir "lagestiondes")
      const commonWords = ['la', 'le', 'les', 'de', 'des', 'du', 'une', 'un', 'et', 'en', 'pour', 'avec', 'dans', 'sur', 'par', 'ce', 'cette', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs'];
      if (commonWords.includes(p1.toLowerCase()) || commonWords.includes(p2.toLowerCase()) || commonWords.includes(p3.toLowerCase())) {
        return match; // Ne touche pas aux vrais mots
      }
      return p1 + p2 + p3;
    });
  
  // Fix pour les caractères accentués isolés (très conservateur)
  s = s.replace(/\b([àâäéèêëïîôùûüÿç])\s+([a-zàâäéèêëïîôùûüÿç]{1,3})\b/gi, "$1$2");
  
  return s;
}

export function normalizeForDisplay(input: string): string {
  let s = tightenObviousSplits(stripInvisibles(String(input || "")));
  
  // Détection améliorée pour les patterns PDF typiques
  const hasSpacedJsonKeys = /\b(task|detailed|conclusion|introduction|draft)\s+_/.test(s);
  const hasSpacedWords = /\b(invest\s+isse\s+ments?|C\s+ais\s+se|L['']é\s+non\s+cé|strat\s+ég\s+ie|g\s+ère|mé\s+can\s+ism|dép\s+ô\s+ts?|op\s+ération\s+nel|é\s+vol\s+ution|analy\s+se)/i.test(s);
  const hasSpacedAccents = /\b[àâäéèêëïîôùûüÿç]\s+[a-zàâäéèêëïîôùûüÿç]{1,3}\b/i.test(s);
  const hasSpacedHyphens = /\w\s+-\s+\w/.test(s);
  const hasMultipleSyllables = /\b[a-zàâäéèêëïîôùûüÿç]{2,4}\s+[a-zàâäéèêëïîôùûüÿç]{2,4}\s+[a-zàâäéèêëïîôùûüÿç]{2,4}\b/i.test(s);
  
  // N'applique le fix PDF QUE si on détecte vraiment des patterns suspects
  if (hasSpacedJsonKeys || hasSpacedWords || hasSpacedAccents || hasSpacedHyphens || hasMultipleSyllables) {
    console.log("Applying PDF extraction fix - detected:", { 
      hasSpacedJsonKeys, 
      hasSpacedWords, 
      hasSpacedAccents, 
      hasSpacedHyphens,
      hasMultipleSyllables 
    });
    s = fixPdfExtractionSpacing(s);
  }
  
  // Remove excessive line breaks that cause word-per-line display
  s = s.replace(/\r/g, "");
  // Replace multiple consecutive newlines with paragraph breaks
  s = s.replace(/\n{3,}/g, "\n\n");
  // Replace single newlines with spaces (this fixes the word-per-line issue)
  s = s.replace(/(?<!\n)\n(?!\n)/g, " ");
  // Normalize multiple spaces
  s = s.replace(/[ \t]+/g, " ");
  
  // Basic punctuation spacing
  s = s.replace(/\s+([,;:.!?…])/g, "$1");
  s = s.replace(/([.!?…])\s+/g, "$1 ");
  
  return s.trim();
}

export function cleanAnalysisFields(obj: any) {
  const out = { ...obj };
  for (const k of ["task_understanding", "introduction", "detailed_plan", "conclusion", "draft"]) {
    if (typeof out[k] === "string") {
      // Simple cleanup only - JSON repair model handles the heavy lifting
      out[k] = stripInvisibles(out[k]).trim();
    }
  }
  return out;
}

