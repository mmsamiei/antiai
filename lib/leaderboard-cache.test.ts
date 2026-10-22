import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ version: 0 }));
vi.mock("node:fs", () => ({ statSync: () => ({ mtimeMs: m.version }) }));
import { leaderboardCache, challengeBoardTtl } from "./leaderboard-cache";
afterEach(() => { vi.useRealTimers(); leaderboardCache.clear(); });
it("detects shared correction invalidation before the TTL expires", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T00:00Z"));
  const load = vi.fn(async (): Promise<number> => load.mock.calls.length);
  expect(await leaderboardCache.get("board", 1800000, load)).toBe(1);
  await vi.advanceTimersByTimeAsync(1001); m.version++;
  expect(await leaderboardCache.get("board", 1800000, load)).toBe(2);
});
it("keeps the end boundary fresh until in-flight writes can settle", () => {
  const end = new Date("2026-10-22T00:00Z");
  expect(challengeBoardTtl(end, new Date(+end - 1))).toBe(5000);
  expect(challengeBoardTtl(end, new Date(+end + 29999))).toBe(5000);
  expect(challengeBoardTtl(end, new Date(+end + 30000))).toBe(1800000);
});
