import { randomInt } from "node:crypto";
import { normalizePersian } from "./geo";

export type PhraseHistoryCandidate = { phrase: string; score: number };
export type PhraseHistorySelection = {
  previousGuesses: { guess: string; score_out_of_100: number }[];
  counts: { globalTop: number; userTop: number; randomOthers: number; globalFill: number };
};

/** Inputs must all belong to the same challenge. Quotas apply before overlap removal. */
export function selectPhraseHuntHistory(
  pools: {
    global: readonly PhraseHistoryCandidate[];
    user: readonly PhraseHistoryCandidate[];
    others: readonly PhraseHistoryCandidate[];
  },
  currentGuess: string,
  randomIndex: (exclusiveMax: number) => number = randomInt,
): PhraseHistorySelection {
  const excluded = normalizePersian(currentGuess);
  const compare = (a: PhraseHistoryCandidate, b: PhraseHistoryCandidate) =>
    b.score - a.score || (a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : 0);
  const unique = (rows: readonly PhraseHistoryCandidate[]) => {
    const words = new Map<string, PhraseHistoryCandidate>();
    for (const row of rows) {
      const phrase = normalizePersian(row.phrase);
      if (!phrase || phrase === excluded || !Number.isFinite(row.score) || row.score < 0 || row.score > 100) continue;
      const previous = words.get(phrase);
      if (!previous || row.score > previous.score) words.set(phrase, { phrase, score: row.score });
    }
    return [...words.values()].sort(compare);
  };
  const global = unique(pools.global);
  // Use the shared score for a word whenever it is available in the global pool.
  const canonical = new Map(global.map(row => [row.phrase, row]));
  const selected = new Map<string, PhraseHistoryCandidate>();
  const counts = { globalTop: 0, userTop: 0, randomOthers: 0, globalFill: 0 };
  const add = (row: PhraseHistoryCandidate, bucket: keyof typeof counts) => {
    if (selected.size >= 200 || selected.has(row.phrase)) return;
    selected.set(row.phrase, canonical.get(row.phrase) ?? row);
    counts[bucket]++;
  };
  for (const row of global.slice(0, 50)) add(row, "globalTop");
  for (const row of unique(pools.user).slice(0, 100)) add(row, "userTop");
  // Draw the 50-word random quota before removing cross-bucket overlap.
  // Vacancies belong to the global-best fallback, not extra random draws.
  const remainingOthers = unique(pools.others);
  for (let i = 0; i < Math.min(50, remainingOthers.length); i++) {
    const offset = randomIndex(remainingOthers.length - i);
    if (!Number.isInteger(offset) || offset < 0 || offset >= remainingOthers.length - i) throw new Error("INVALID_RANDOM_INDEX");
    const j = i + offset;
    [remainingOthers[i], remainingOthers[j]] = [remainingOthers[j], remainingOthers[i]];
    add(remainingOthers[i], "randomOthers");
  }
  for (const row of global) add(row, "globalFill");
  return {
    // Fix display order independently of which bucket selected the word.
    previousGuesses: [...selected.values()].sort(compare).map(row => ({ guess: row.phrase, score_out_of_100: row.score })),
    counts,
  };
}
