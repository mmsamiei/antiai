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
      state: { prompt_word: prompt.name, submitted_word: word, language: "Persian" },
      questions: {
        verdict: {
          type: "choice",
          instructions: "Judge the submitted word as a Persian adjective describing the prompt word. DIRECT means natural and direct. ACCEPT means defensible but less direct. REJECT means unrelated, not an adjective, or an unnatural description. Never accept a mere associated noun.",
          criteria: {
            DIRECT: "A common, natural, direct adjective for the prompt word.",
            ACCEPT: "A defensible Persian adjective for the prompt word, but less direct.",
            REJECT: "Not a suitable adjective for the prompt word."
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
  const reason = choice === "DIRECT" ? "صفتی دقیق و طبیعی است." : choice === "ACCEPT" ? "قابل‌قبول است؛ ادامه بده." : "برای این واژه، صفتِ طبیعی‌ای نیست.";
  await prisma.adjectiveJudgment.create({ data: { promptId, word, accepted, quality, reason } });
  return { accepted, quality, reason, word };
}
