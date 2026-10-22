import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ groupBy: vi.fn(), raw: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { phraseHuntGuess: mocks, $queryRaw: mocks.raw } }));
import { loadPhraseHuntHistory } from "./phrase-hunt-history-store";

describe("challenge-scoped history loading", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.raw.mockResolvedValue([]); });
  it("separates current challenge/player/others, deduplicates in SQL and returns no identities", async () => {
    mocks.groupBy.mockResolvedValueOnce([{ normalized: "باغ", _max: { score: 50 } }])
      .mockResolvedValueOnce([{ normalized: "درخت", _max: { score: 30 } }]);
    mocks.raw.mockResolvedValueOnce([{ normalized: "میوه", score: 35 }]);
    const result = await loadPhraseHuntHistory("challenge-1", "player-1", "كتاب");
    expect(mocks.groupBy).toHaveBeenCalledTimes(2);
    const calls = mocks.groupBy.mock.calls.map(([arg]) => arg);
    for (const call of calls) {
      expect(call.by).toEqual(["normalized"]);
      expect(call.where.game.phraseChallengeId).toBe("challenge-1");
      expect(call.where.normalized).toEqual({ not: "کتاب" });
    }
    expect(calls[0].take).toBe(200);
    expect(calls[1].take).toBe(100);
    expect(calls[1].where.game.userId).toBe("player-1");
    expect(mocks.raw).toHaveBeenCalledTimes(1);
    expect(mocks.raw.mock.calls[0].slice(1)).toEqual(["challenge-1", "player-1", "کتاب"]);
    expect(mocks.raw.mock.calls[0][0].join("?")).toContain("GROUP BY g.normalized ORDER BY random() LIMIT 50");
    expect(result.previousGuesses).toEqual([
      { guess: "باغ", score_out_of_100: 50 },
      { guess: "میوه", score_out_of_100: 35 },
      { guess: "درخت", score_out_of_100: 30 },
    ]);
  });
  it("does not silently produce partial history when a pool query fails", async () => {
    mocks.groupBy.mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValue([]);
    await expect(loadPhraseHuntHistory("challenge-1", "player-1", "جدید")).rejects.toThrow("database unavailable");
    expect(mocks.groupBy).toHaveBeenCalledTimes(2);
  });
});
