import { describe, expect, it } from "vitest";
import { selectPhraseHuntHistory, type PhraseHistoryCandidate } from "./phrase-hunt-history";

const rows = (prefix: string, count: number, score: number): PhraseHistoryCandidate[] =>
  Array.from({ length: count }, (_, i) => ({ phrase: `${prefix} ${i}`, score }));
const first = () => 0;

describe("200-word shared phrase history", () => {
  it("selects 50 global, 100 personal and 50 distinct random words from others", () => {
    const globalTop = rows("جهانی", 50, 95), user = rows("شخصی", 100, 75), others = rows("دیگران", 80, 50);
    const result = selectPhraseHuntHistory({ global: [...globalTop, ...user, ...others], user, others }, "جدید", first);
    expect(result.counts).toEqual({ globalTop: 50, userTop: 100, randomOthers: 50, globalFill: 0 });
    expect(result.previousGuesses).toHaveLength(200);
    expect(new Set(result.previousGuesses.map(x => x.guess)).size).toBe(200);
  });

  it("fills overlap vacancies with the best remaining global words, not extra personal words", () => {
    const global = rows("واژه", 300, 90).map((r, i) => ({ ...r, score: 99 - i / 10 }));
    const result = selectPhraseHuntHistory({ global, user: global.slice(0, 140), others: global.slice(0, 60) }, "جدید", first);
    expect(result.counts).toEqual({ globalTop: 50, userTop: 50, randomOthers: 0, globalFill: 100 });
    expect(result.previousGuesses.map(x => x.guess)).toEqual(global.slice(0, 200).map(x => x.phrase));
  });

  it("fills random-bucket overlap globally instead of drawing additional random words", () => {
    const global = rows("واژه", 300, 90).map((r, i) => ({ ...r, score: 99 - i / 10 }));
    const result = selectPhraseHuntHistory({ global, user: [], others: global.slice(0, 150) }, "جدید", first);
    expect(result.counts).toEqual({ globalTop: 50, userTop: 0, randomOthers: 0, globalFill: 150 });
    expect(result.previousGuesses.map(x => x.guess)).toEqual(global.slice(0, 200).map(x => x.phrase));
  });

  it("deduplicates normalized Persian forms and excludes the submitted guess from every pool", () => {
    const global = [{ phrase: "  باغ‌میوه ", score: 60 }, { phrase: "باغ میوه", score: 60 }, { phrase: "كتاب", score: 20 }];
    const result = selectPhraseHuntHistory({ global, user: global, others: global }, "کتاب", first);
    expect(result.previousGuesses).toEqual([{ guess: "باغ میوه", score_out_of_100: 60 }]);
  });

  it("returns all available unique words when fewer than 200 exist, including an empty history", () => {
    expect(selectPhraseHuntHistory({ global: [], user: [], others: [] }, "جدید", first).previousGuesses).toEqual([]);
    const global = rows("واژه", 12, 25);
    expect(selectPhraseHuntHistory({ global, user: global.slice(0, 4), others: global.slice(4) }, "جدید", first).previousGuesses).toHaveLength(12);
  });

  it("samples unique other-player words without replacement", () => {
    const top = rows("برتر", 50, 99), others = rows("دیگران", 80, 30);
    const result = selectPhraseHuntHistory({ global: [...top, ...others], user: [], others: [...others, ...others] }, "جدید", n => n - 1);
    expect(result.counts.randomOthers).toBe(50);
    expect(result.counts.globalFill).toBe(30);
    expect(result.previousGuesses).toHaveLength(130);
  });

  it("keeps stable descending score order with lexical tie breaks and does not mutate inputs", () => {
    const global = [{ phrase: "ب", score: 40 }, { phrase: "الف", score: 40 }, { phrase: "ج", score: 60 }];
    const before = structuredClone(global);
    expect(selectPhraseHuntHistory({ global, user: [], others: [] }, "جدید", first).previousGuesses.map(x => x.guess)).toEqual(["ج", "الف", "ب"]);
    expect(global).toEqual(before);
  });

  it("uses shared canonical scores and skips invalid entries", () => {
    const global = [{ phrase: "باغ", score: 60 }, { phrase: "", score: 30 }, { phrase: "خراب", score: NaN }];
    expect(selectPhraseHuntHistory({ global, user: [{ phrase: "باغ", score: 70 }], others: [] }, "جدید", first).previousGuesses).toEqual([{ guess: "باغ", score_out_of_100: 60 }]);
  });
});
