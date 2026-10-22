import { leaderboardCache } from "@/lib/leaderboard-cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { phraseWeekStart } from "@/lib/phrase-hunt-schedule";
const mocks = vi.hoisted(() => ({ user: vi.fn(), query: vi.fn(), users: vi.fn(), challengeBoard: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.query, user: { findMany: mocks.users } } }));
vi.mock("@/lib/phrase-hunt-leaderboard", () => ({ phraseChallengeLeaderboard: mocks.challengeBoard }));
import { GET } from "./route";
beforeEach(() => {
  leaderboardCache.clear();
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-16T12:00Z"));
  mocks.user.mockReturnValue("owner");
  mocks.query.mockResolvedValue([{ userId: "top", totalScore: 115.45, games: 2 }, { userId: "owner", totalScore: 80, games: 1 }]);
  mocks.users.mockResolvedValue([{ id: "top", username: "top" }, { id: "owner", username: "owner" }]);
});
afterEach(() => vi.useRealTimers());
it("requires authentication", async () => {
  mocks.user.mockReturnValue(null);
  expect((await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT"))).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("uses a single total-score criterion even when skill mode is requested", async () => {
  const response = await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT&period=all&mode=skill"));
  expect(await response.json()).toMatchObject({ mode: "total", period: "all", minimumWins: 0,
    rows: [{ rank: 1, totalScore: 115.45, games: 2 }, { rank: 2, totalScore: 80 }], me: { userId: "owner", rank: 2 } });
  expect(mocks.query.mock.calls[0][0].values.some((value: unknown) => value instanceof Date)).toBe(false);
});
it("filters the weekly board by the Tehran Saturday challenge start", async () => {
  await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT&period=week"));
  expect(mocks.query.mock.calls[0][0].values).toContainEqual(phraseWeekStart());
});

it("passes challenge selection with authenticated identity", async () => {
  mocks.challengeBoard.mockResolvedValue({ rows: [], me: null, period: "challenge" });
  const r = await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT&period=challenge&challengeId=old"));
  expect(r.status).toBe(200);
  expect(mocks.challengeBoard).toHaveBeenCalledWith("owner", "old");
});
it("returns 404 for unavailable challenge", async () => {
  mocks.challengeBoard.mockResolvedValue(null);
  const r = await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT&period=challenge&challengeId=future"));
  expect(r.status).toBe(404);
});

it("shares aggregate work across accounts while keeping me and privacy fresh", async () => {
 const first = await (await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT&period=all"))).json();
 expect(first.me.userId).toBe("owner");
 mocks.user.mockReturnValue("top"); mocks.users.mockResolvedValue([{id:"top",username:"private",showUsername:false,firstName:"نام تازه"},{id:"owner",username:"owner"}]);
 const second=await (await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT&period=all"))).json();
 expect(second.me.userId).toBe("top"); expect(second.me.displayName).toBe("نام تازه"); expect(JSON.stringify(second)).not.toContain("@private");
 expect(mocks.query).toHaveBeenCalledTimes(1); expect(mocks.users).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(5001); await GET(new Request("https://test/api/leaderboard?type=PHRASE_HUNT&period=all"));expect(mocks.query).toHaveBeenCalledTimes(2);
});
