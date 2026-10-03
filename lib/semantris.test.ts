import { describe, expect, it } from "vitest";
import { applySemantrisMove, applySemantrisTick, createSemantrisState, semantrisClueRejection, type SemantrisState } from "./semantris";
import { fairnessInstructions, parseSemantrisFairness } from "./semantris-judge";
const words = ["یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت"];
function state(targetWord: string): SemantrisState { return { words, targetWord, score: 0, cleared: 0, moves: 0, combo: 0, gameOver: false, lastDropAt: new Date().toISOString(), wave: { categoryId: "fruits", queue: ["سیب", "موز"], position: 0 }, clues: [], usedClues: [], pendingWords: [], correctHits: 0 }; }
describe("Semantris category waves", () => {
  it("prepares fifteen random words from the selected category for each wave", () => { expect(createSemantrisState().wave.queue).toHaveLength(15); });
});

describe("Semantris deletion zone", () => {
  it("scores ten points per removed word without a combo multiplier", () => { const current = state("هشت"); current.combo = 5; const result = applySemantrisMove(current, "سرنخ", words); expect(result.hit).toBe(true); expect(result.targetRank).toBe(1); expect(result.removed).toBe(4); expect(result.score).toBe(40); expect(result.combo).toBe(0); });
  it("awards ten points when only the target is removed", () => { const result = applySemantrisMove(state("پنج"), "سرنخ", words); expect(result.hit).toBe(true); expect(result.targetRank).toBe(4); expect(result.removed).toBe(1); expect(result.score).toBe(10); });
});

describe("Semantris clue rules", () => {
  it("rejects a clue already visible on the board after Persian normalization", () => { expect(semantrisClueRejection(state("یک"), "كِتاب")).toBe(null); const current = state("یک"); current.words = [...current.words, "کتاب"]; expect(semantrisClueRejection(current, "كِتاب")).toBe("CLUE_ON_BOARD"); });
  it("rejects every previously used clue, even after it leaves the visible history", () => { const current = state("یک"); current.usedClues = ["سرنخ قدیمی"]; expect(semantrisClueRejection(current, "سرنخ‌قدیمی")).toBe("CLUE_REPEATED"); });
});

describe("Semantris fairness verdict", () => {
  it("accepts only explicit fair-play decisions from JEV", () => { expect(parseSemantrisFairness("FAIR")).toBe("FAIR"); expect(parseSemantrisFairness("CHEATING")).toBe("CHEATING"); expect(() => parseSemantrisFairness("UNKNOWN")).toThrow("JEV_UNAVAILABLE"); });
  it("tells JEV that independent synonyms such as سرخ for قرمز are fair", () => { expect(fairnessInstructions).toContain("سرخ for قرمز"); expect(fairnessInstructions).toContain("never semantic strength"); });
});

describe("Semantris automatic drops", () => {
  it("does not add a word until three successful hits unlock automatic drops", () => { const current = state("یک"); current.correctHits = 2; current.lastDropAt = "2026-10-02T00:00:00.000Z"; expect(applySemantrisTick(current, new Date("2026-10-02T00:01:00.000Z")).added).toBe(false); });
  it("adds one word at the top after ten seconds", () => { const current = state("یک"); current.correctHits = 3; current.lastDropAt = "2026-10-02T00:00:00.000Z"; const result = applySemantrisTick(current, new Date("2026-10-02T00:00:10.000Z")); expect(result.added).toBe(true); expect(result.words).toHaveLength(current.words.length + 1); expect(result.words.slice(1)).toEqual(current.words); });
  it("starts a fresh ten-second countdown after the third successful hit", () => { const current = state("هشت"); current.correctHits = 2; current.lastDropAt = "2026-10-02T00:00:00.000Z"; const moved = applySemantrisMove(current, "سرنخ", words); const startedAt = new Date(moved.lastDropAt).getTime(); expect(moved.correctHits).toBe(3); expect(applySemantrisTick(moved, new Date(startedAt + 9_999)).added).toBe(false); expect(applySemantrisTick(moved, new Date(startedAt + 10_000)).added).toBe(true); });
  it("adds the newest player clue before older queued clues and the category wave", () => { const current = state("یک"); current.correctHits = 3; current.pendingWords = ["سرنخ تازه", "سرنخ قدیمی"]; current.lastDropAt = "2026-10-02T00:00:00.000Z"; const result = applySemantrisTick(current, new Date("2026-10-02T00:00:10.000Z")); expect(result.words[0]).toBe("سرنخ تازه"); expect(result.pendingWords).toEqual(["سرنخ قدیمی"]); expect(result.wave.position).toBe(current.wave.position); });
});
