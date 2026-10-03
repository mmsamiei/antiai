import { normalizePersian } from "./geo";
const scoreByChoice: Record<string, number> = { NONE: 0, WEAK: 1, RELATED: 2, STRONG: 3, DIRECT: 4 };
export type SemantrisFairness = "FAIR" | "CHEATING";
export const fairnessInstructions = "Decide whether the Persian clue is fair in this Semantris round. It is CHEATING if it reveals, copies, truncates, misspells, transliterates, inflects, derives from, or makes a near-surface-form variation of any word currently on the board. Examples: یاسم for یاسمن, پرسپولیسی for پرسپولیس, and سرخ for سرخی are cheating. Never label a clue CHEATING merely because it is a synonym, near-synonym, antonym, category, property, cultural reference, or translation with a different lexical root. In particular, سرخ for قرمز, خوشبو for یاسمن, and فوتبال for پرسپولیس are FAIR. CHEATING requires a visible shared lexical root or surface form with a board word. Judge lexical leakage only, never semantic strength.";
export function parseSemantrisFairness(choice: unknown): SemantrisFairness {
  if (choice === "FAIR" || choice === "CHEATING") return choice;
  throw new Error("JEV_UNAVAILABLE");
}
export async function judgeSemantris(clueRaw: string, candidates: string[]) {
  const clue = normalizePersian(clueRaw); if (!clue || clue.length > 80 || clue.split(" ").length > 12) throw new Error("CLUE_INVALID");
  const apiKey = process.env.JEV_API_KEY; if (!apiKey) throw new Error("JEV_UNAVAILABLE");
  const wordQuestions = Object.fromEntries(candidates.map((candidate, index) => [`word_${index}`, { type: "choice", instructions: `Rate how naturally «${candidate}» works as a conversational or semantic response to the Persian clue. Associations, synonyms, antonyms, slang, technical terms, pop-culture references, and sentence clues can be valid. Judge independently.`, criteria: { DIRECT: "The clearest immediate association.", STRONG: "A strong natural association.", RELATED: "Meaningfully related.", WEAK: "Only loosely related.", NONE: "No meaningful association." } }]));
  const questions = { clue_fairness: { type: "choice", instructions: fairnessInstructions, criteria: { FAIR: "A standalone clue with no lexical or morphological giveaway of a board word.", CHEATING: "A lexical, spelling, substring, inflectional, derivational, transliterated, or near-form giveaway of a board word." } }, ...wordQuestions };
  const response = await fetch(process.env.JEV_API_URL || "https://openrouter.ai/api/alpha/decisions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.JEV_MODEL || "typesafe/jev-1.13", state: { language: "Persian", clue, candidates }, questions }), signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("JEV_UNAVAILABLE"); const payload = await response.json() as { answers?: Record<string, { choice?: string }> };
  const fairness = parseSemantrisFairness(payload.answers?.clue_fairness?.choice);
  const rankedWords = candidates.map((word, index) => ({ word, index, score: scoreByChoice[payload.answers?.[`word_${index}`]?.choice || "NONE"] || 0 })).sort((a, b) => a.score - b.score || a.index - b.index).map((item) => item.word);
  return { clue, fairness, rankedWords };
}
