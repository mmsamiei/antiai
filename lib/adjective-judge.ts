import { prisma } from "./prisma";
import { normalizePersian } from "./geo";
import { promptById } from "./data/adjective-prompts";

export type AdjectiveVerdict = { accepted: boolean; quality: number; reason: string; word: string };

export async function judgeAdjective(promptId: string, rawWord: string): Promise<AdjectiveVerdict> {
  const prompt = promptById(promptId);
  const word = normalizePersian(rawWord);
  if (!prompt || !word || word.length > 40 || word.split(" ").length > 3) return { accepted: false, quality: -1, reason: "یک صفتِ کوتاه فارسی بنویس.", word };
  const cached = await prisma.adjectiveJudgment.findUnique({ where: { promptId_word: { promptId, word } } });
  if (cached) return { accepted: cached.accepted, quality: cached.quality, reason: cached.reason || "", word };

  const seededIndex = prompt.examples.map(normalizePersian).indexOf(word);
  if (seededIndex >= 0) {
    const verdict = { accepted: true, quality: 2, reason: "صفتی طبیعی و دقیق است.", word };
    await prisma.adjectiveJudgment.create({ data: { promptId, word, accepted: true, quality: 2, reason: verdict.reason } });
    return verdict;
  }

  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) return { accepted: false, quality: -1, reason: "داور هوشمند فعلاً در دسترس نیست؛ یک صفت دیگر امتحان کن.", word };
  const response = await fetch(process.env.JEV_API_URL || "https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || "typesafe/jev-1.13",
      state: { target_word: prompt.name, submitted_word: word, part_of_speech: prompt.partOfSpeech || "صفت", language: "Persian" },
      questions: {
        verdict: {
          type: "choice",
          instructions: "Judge whether submitted_word is a true Persian synonym or close synonym of target_word, with the same part of speech. This is a strict synonym game, not a word-association game. Reject words that merely share a topic, are a different part of speech, are antonyms, or are the target word itself.",
          criteria: {
            DIRECT: "A common, natural direct synonym or near-synonym with the same central meaning.",
            ACCEPT: "A defensible but less common close synonym; it must still preserve the central meaning.",
            REJECT: "Not a real synonym or close synonym, or it is the target word itself."
          }
        }
      }
    }),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("JEV_UNAVAILABLE");
  const payload = await response.json() as { answers?: { verdict?: { choice?: string } } };
  const choice = payload.answers?.verdict?.choice;
  const accepted = choice === "DIRECT" || choice === "ACCEPT";
  const quality = choice === "DIRECT" ? 2 : choice === "ACCEPT" ? 1 : -1;
  const reason = choice === "DIRECT" ? "هم‌معنیِ دقیق است." : choice === "ACCEPT" ? "هم‌معنیِ نزدیک و قابل‌قبولی است." : "هم‌معنیِ این صفت نیست.";
  await prisma.adjectiveJudgment.create({ data: { promptId, word, accepted, quality, reason } });
  return { accepted, quality, reason, word };
}
