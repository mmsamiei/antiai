import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ groupBy: vi.fn(), raw: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { phraseHuntGuess: mocks, $queryRaw: mocks.raw } }));
import { loadPhraseHuntHistory, phraseHuntGlobalHistoryCache } from "./phrase-hunt-history-store";
const globalCalls = () => mocks.groupBy.mock.calls.filter(([arg]) => !arg.where.game.userId);

describe("challenge-scoped history loading", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); phraseHuntGlobalHistoryCache.clear();
    mocks.raw.mockResolvedValue([]);
    mocks.groupBy.mockImplementation(async ({ where }) => where.game.userId
      ? [{ normalized: "درخت", _max: { score: 30 } }]
      : [{ normalized: "باغ", _max: { score: 50 } }, { normalized: "کتاب", _max: { score: 20 } }]);
  });
  afterEach(() => vi.useRealTimers());

  it("keeps shared history challenge-scoped and excludes the current guess after caching", async () => {
    mocks.raw.mockResolvedValueOnce([{ normalized: "میوه", score: 35 }]);
    const result = await loadPhraseHuntHistory("challenge-1", "player-1", "كتاب");
    expect(globalCalls()[0][0]).toMatchObject({ by: ["normalized"], where: { game: { phraseChallengeId: "challenge-1" } }, take: 201 });
    expect(globalCalls()[0][0].where).not.toHaveProperty("normalized");
    expect(mocks.raw.mock.calls[0].slice(1)).toEqual(["challenge-1", "player-1", "کتاب"]);
    expect(result.previousGuesses).toEqual([
      { guess: "باغ", score_out_of_100: 50 }, { guess: "میوه", score_out_of_100: 35 }, { guess: "درخت", score_out_of_100: 30 },
    ]);
    const next = await loadPhraseHuntHistory("challenge-1", "player-2", "باغ");
    expect(next.previousGuesses.some(row => row.guess === "باغ")).toBe(false);
    expect(next.previousGuesses.some(row => row.guess === "کتاب")).toBe(true);
    expect(globalCalls()).toHaveLength(1);
    expect(mocks.raw).toHaveBeenCalledTimes(2);
  });

  it("shares one refresh between concurrent users, expires at ten seconds, and isolates challenges", async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => loadPhraseHuntHistory("challenge-1", "player-" + i, "جدید")));
    expect(globalCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(9999);
    await loadPhraseHuntHistory("challenge-1", "player", "جدید");
    expect(globalCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await loadPhraseHuntHistory("challenge-1", "player", "جدید");
    expect(globalCalls()).toHaveLength(2);
    await loadPhraseHuntHistory("challenge-2", "player", "جدید");
    expect(globalCalls()).toHaveLength(3);
  });

  it("does not cache a failed refresh or silently produce partial history", async () => {
    const normal = mocks.groupBy.getMockImplementation()!;
    mocks.groupBy.mockImplementation(async arg => { if (!arg.where.game.userId) throw new Error("database unavailable"); return normal(arg); });
    await expect(loadPhraseHuntHistory("challenge-1", "player-1", "جدید")).rejects.toThrow("database unavailable");
    mocks.groupBy.mockImplementation(normal);
    await expect(loadPhraseHuntHistory("challenge-1", "player-1", "جدید")).resolves.toHaveProperty("previousGuesses");
    expect(globalCalls()).toHaveLength(2);
  });
});
