import { describe, expect, it } from "vitest";
import { hiddenPhraseGuesses, mergePhraseGuess, normalizePersian, orderPhraseGuesses } from "./phrase-hunt-view";

const guesses = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: `حدس ${i}`, score: i * 10, createdAt: new Date(1_000 + i * 1_000).toISOString() }));

describe("phrase history display", () => {
  it("hides only the old guesses outside the best three without mutating the source", () => {
    const hidden = hiddenPhraseGuesses(guesses);
    expect([...hidden]).toEqual(["0", "1", "2", "3", "4"]);
    expect(guesses.map(g => g.id)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
    const newGuess = { ...guesses[0], id: "new", createdAt: new Date(10_000).toISOString() };
    expect([...guesses, newGuess].filter(g => !hidden.has(g.id))).toHaveLength(4);
    hidden.delete("1");
    expect(guesses.filter(g => !hidden.has(g.id)).some(g => g.id === "1")).toBe(true);
  });
  it("shows recent low scores first in recent order and keeps score ordering stable for ties", () => {
    const items = [{ ...guesses[0], score: 90 }, { ...guesses[1], score: 90 }, guesses[2]];
    expect(orderPhraseGuesses(items, "score").map(g => g.id)).toEqual(["0", "1", "2"]);
    expect(orderPhraseGuesses(items, "recent").map(g => g.id)).toEqual(["2", "1", "0"]);
    expect(hiddenPhraseGuesses(items).size).toBe(0);
  });
  it("recognizes Persian spelling variants for duplicate result lookup", () => {
    expect(normalizePersian("  هوايِ پاک! ")).toBe(normalizePersian("هوای پاک"));
    expect(normalizePersian("باقی‌مانده")).toBe(normalizePersian("باقی مانده"));
  });
});

describe("compact phrase guess responses", () => {
  it("preserves a long loaded history and its best score, and merges duplicate response IDs once", () => {
    const history = Array.from({ length: 300 }, (_, i) => ({ ...guesses[0], id: String(i), score: i % 100 }));
    const next = { ...guesses[0], id: "new", score: 4 };
    const merged = mergePhraseGuess(history, next, 99);
    expect(merged.phraseGuesses).toHaveLength(301);
    expect(merged.phraseGuesses.slice(0, 300)).toEqual(history);
    expect(merged.bestScore).toBe(99);
    expect(mergePhraseGuess(merged.phraseGuesses, next).phraseGuesses).toHaveLength(301);
    expect(history).toHaveLength(300);
  });
  it("raises the best score on a winning response", () => {
    expect(mergePhraseGuess(guesses, { ...guesses[0], id: "win", score: 100 }).bestScore).toBe(100);
  });
});
