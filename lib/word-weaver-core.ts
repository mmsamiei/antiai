import { randomInt } from "node:crypto";
import { normalizePersian } from "./geo";

export const WORD_WEAVER_WRITE_MS = 30_000;
export const WORD_WEAVER_RESULTS_MS = 10_000;
export const WORD_WEAVER_PRESENCE_MS = 30_000;
export const WORD_WEAVER_RUBRIC_VERSION = "2";
export const WORD_WEAVER_MODEL = "typesafe/jev-1.13";

export function validateWordWeaverText(raw: string) {
  const text = raw.trim();
  const length = [...text].length;
  if (length < 2 || length > 200 || !/\p{L}/u.test(text)) {
    return { valid: false as const, text, error: "پاسخ باید بین ۲ تا ۲۰۰ نویسه باشد." };
  }
  return { valid: true as const, text };
}

export function validateWordWeaverNextWord(raw: string, currentWord: string) {
  const word = raw.trim().normalize("NFKC");
  const length = [...word].filter((character) => character !== "\u200c").length;
  if (length < 2 || length > 24 || !/^[\p{Script=Arabic}\u200c]+$/u.test(word)) {
    return { valid: false as const, word, error: "یک واژهٔ فارسیِ تک‌کلمه‌ای بنویس (۲ تا ۲۴ نویسه)." };
  }
  if (normalizePersian(word) === normalizePersian(currentWord)) {
    return { valid: false as const, word, error: "واژهٔ دور بعد باید با واژهٔ فعلی فرق داشته باشد." };
  }
  return { valid: true as const, word };
}

export function finalWordWeaverScore(relevance: number, originality: number, expression: number) {
  const scores = [relevance, originality, expression];
  if (scores.some((score) => !Number.isFinite(score) || score < 0 || score > 4)) {
    throw new Error("JEV_RESPONSE_INVALID");
  }
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / 12) * 10_000);
}

export function pickTiedWinner<T>(items: T[], random: (max: number) => number = randomInt) {
  if (!items.length) return null;
  return items[random(items.length)];
}

export function chooseRandomWord(words: string[], recentWords: string[], random: (max: number) => number = randomInt) {
  if (!words.length) throw new Error("WORD_BANK_EMPTY");
  const recent = new Set(recentWords.map(normalizePersian));
  const available = words.filter((word) => !recent.has(normalizePersian(word)));
  const choices = available.length ? available : words;
  return choices[random(choices.length)];
}
