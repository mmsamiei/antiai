import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { phraseWeekStart } from "@/lib/phrase-hunt-schedule";
const mocks = vi.hoisted(() => ({ user: vi.fn(), query: vi.fn(), users: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.query, user: { findMany: mocks.users } } }));
import { GET } from "./route";
beforeEach(() => {
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
