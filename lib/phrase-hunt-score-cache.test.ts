import { afterEach, expect, it, vi } from "vitest";
import { PhraseHuntScoreCache } from "./phrase-hunt-score-cache";
afterEach(() => vi.useRealTimers());
it("retains zero, expires entries, and bounds memory by evicting old scores", () => {
  vi.useFakeTimers();
  const cache = new PhraseHuntScoreCache(2, 1000);
  cache.set("challenge-a", 0);
  expect(cache.get("challenge-a")).toBe(0);
  cache.set("challenge-b", 42);
  cache.set("challenge-c", 60);
  expect(cache.get("challenge-a")).toBeUndefined();
  expect(cache.get("challenge-b")).toBe(42);
  vi.advanceTimersByTime(1000);
  expect(cache.get("challenge-b")).toBeUndefined();
  cache.clear();
  expect(cache.get("challenge-c")).toBeUndefined();
});
