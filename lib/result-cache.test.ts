import { afterEach, expect, it, vi } from "vitest";
import { ResultCache } from "./result-cache";
afterEach(() => vi.useRealTimers());
it("coalesces a burst, isolates callers and preserves dates", async () => {
  const cache = new ResultCache(), load = vi.fn(async () => [{ n: 1, at: new Date(100) }]);
  const values = await Promise.all(Array.from({ length: 200 }, () => cache.get("board", 5000, load)));
  expect(load).toHaveBeenCalledTimes(1);
  values[0][0].n = 99;
  expect((await cache.get("board", 5000, load))[0]).toEqual({ n: 1, at: new Date(100) });
});
it("expires, bounds storage and retries failures", async () => {
  vi.useFakeTimers(); const cache = new ResultCache(1), load = vi.fn(async () => 1);
  await cache.get("a", 100, load); await vi.advanceTimersByTimeAsync(101); await cache.get("a", 100, load);
  await cache.get("b", 100, load); await cache.get("a", 100, load); expect(load).toHaveBeenCalledTimes(4);
  await expect(cache.get("bad", 100, async () => { throw Error("failed"); })).rejects.toThrow("failed");
  expect(await cache.get("bad", 100, async () => 2)).toBe(2);
  const tiny = new ResultCache(10, 1), big = vi.fn(async () => "oversized");
  await tiny.get("big", 100, big); await tiny.get("big", 100, big); expect(big).toHaveBeenCalledTimes(2);
});
it("does not restore invalidated data when an older load completes", async () => {
  const cache = new ResultCache(); let resolve!: (n: number) => void;
  const old = cache.get("key", 1000, () => new Promise<number>(r => { resolve = r; }));
  await Promise.resolve(); cache.clear();
  expect(await cache.get("key", 1000, async () => 2)).toBe(2);
  resolve(1); expect(await old).toBe(1);
  expect(await cache.get("key", 1000, async () => 3)).toBe(2);
});
