import { afterEach, expect, it, vi } from "vitest";
import { readPhraseHuntGuessState } from "./phrase-hunt-guess-state";
afterEach(() => vi.useRealTimers());
it("binds ownership and raw guess text as parameters, preserving the rolling user-wide limit", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  const row = { id: "game", duplicate: false, recentCount: 29 };
  const query = vi.fn().mockResolvedValue([row]);
  const guess = "' OR 1=1 --";
  expect(await readPhraseHuntGuessState({ $queryRaw: query }, "game", "player", guess)).toBe(row);
  const [sql, ...parameters] = query.mock.calls[0];
  expect(parameters).toEqual([guess, "player", new Date("2026-10-23T11:59:00Z"), "game", "player"]);
  expect(sql.join("?")).toContain('recent."userId" = ?');
  expect(sql.join("?")).not.toContain(guess);
});
it("returns null for a missing or inaccessible active game", async () => {
  expect(await readPhraseHuntGuessState({ $queryRaw: vi.fn().mockResolvedValue([]) }, "other", "player", "guess")).toBeNull();
});
