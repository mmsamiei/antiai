import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { finalWordWeaverScore } from "./word-weaver-core";
import { getWordWeaverFeedback, getWordWeaverMission } from "./word-weaver-missions";

const criteria = {
  relevance: ["۰: مأموریت را انجام نداده است.", "۱: فقط اشاره‌ای کم‌رنگ به مأموریت دارد.", "۲: بخشی از مأموریت را قابل‌فهم انجام می‌دهد.", "۳: مأموریت را درست و روشن انجام می‌دهد.", "۴: مأموریت را دقیق و خلاقانه اجرا می‌کند."],
  originality: ["۰: پاسخ بی‌معنا یا کاملاً کلیشه‌ای است.", "۱: بسیار آشنا و قابل‌پیش‌بینی است.", "۲: اندکی تازگی دارد اما ایده آشناست.", "۳: انتخاب واژه یا تصویر تازه‌ای دارد.", "۴: برداشتی خلاقانه و به‌یادماندنی دارد."],
  expression: ["۰: معنا روشن نیست.", "۱: منظور به‌سختی دریافت می‌شود.", "۲: معنا قابل‌فهم اما کم‌دقت است.", "۳: واژه‌ها یا تصویر با دقت و روشنی معنا را می‌رسانند.", "۴: با کمترین واژه، معنایی دقیق و روشن می‌سازد."],
};

export async function requestWordWeaverScores(model: string, word: string, text: string, missionId?: string | null) {
  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) throw new Error("JEV_UNAVAILABLE");
  const mission = getWordWeaverMission(missionId);
  const missionInstruction = mission?.instruction || "با یک واژه یا جملهٔ کوتاه، خلاقانه به واژهٔ موضوع پاسخ بده.";
  const instructions = {
    relevance: `Rate how well the short Persian response fulfills this exact writing mission: «${missionInstruction}». The mission is: «${word}». Score the fit and compliance with its constraints, not merely whether the response repeats words from the prompt.`,
    originality: "Rate the freshness of the word choice or image. Do not reward oddness without meaning, and do not punish colloquial language.",
    expression: "Rate precision and clarity of meaning for this mission. A short phrase or fragment can be excellent; do not require a complete sentence or reward length.",
  };
  const questions = Object.fromEntries(Object.entries(instructions).map(([key, instruction]) => [key, { type: "score", instructions: `Judge only this entry. Mission: «${word}». Entry: «${text}». ${instruction}`, criteria: criteria[key as keyof typeof criteria] }]));
  const response = await fetch(process.env.JEV_API_URL || "https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, state: { language: "Persian", mission, missionPrompt: word, entry: text }, questions }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`JEV_HTTP_${response.status}`);
  const payload = await response.json() as { answers?: Record<string, { type?: string; score?: number }> };
  const read = (key: string) => {
    const answer = payload.answers?.[key];
    if (answer?.type !== "score" || typeof answer.score !== "number") throw new Error("JEV_RESPONSE_INVALID");
    return answer.score;
  };
  const relevance = read("relevance");
  const originality = read("originality");
  const expression = read("expression");
  return { relevanceScore: relevance, originalityScore: originality, expressionScore: expression, finalScore: finalWordWeaverScore(relevance, originality, expression) };
}

export async function judgeWordWeaverEntry(entry: { id: string; roundId: string; text: string; round: { word: string; missionId?: string | null; missionType?: string | null; judgeModel: string } }) {
  let scores: Awaited<ReturnType<typeof requestWordWeaverScores>> | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await prisma.wordWeaverEntry.updateMany({ where: { id: entry.id, roundId: entry.roundId, status: "PENDING" }, data: { judgeAttempts: { increment: 1 } } });
    try {
      scores = await requestWordWeaverScores(entry.round.judgeModel, entry.round.word, entry.text, entry.round.missionId);
      break;
    } catch (error) {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
      else {
        console.error("word-weaver judge failed", entry.id, error instanceof Error ? error.message : "unknown error");
        await prisma.wordWeaverEntry.updateMany({ where: { id: entry.id, roundId: entry.roundId, status: "PENDING" }, data: { status: "FAILED", judgedAt: new Date(), failureMessage: "داوری انجام نشد" } });
        return;
      }
    }
  }
  if (!scores) return;
  // Database failures must leave the entry pending for the worker to recover;
  // they are not failures of the AI judgment.
  const feedback = getWordWeaverFeedback(entry.round.missionType, scores.relevanceScore, scores.expressionScore, scores.originalityScore);
  const data = { ...scores, feedback, status: "SCORED", judgedAt: new Date(), failureMessage: null } satisfies Prisma.WordWeaverEntryUpdateManyMutationInput;
  await prisma.wordWeaverEntry.updateMany({ where: { id: entry.id, roundId: entry.roundId, status: "PENDING" }, data });
}
