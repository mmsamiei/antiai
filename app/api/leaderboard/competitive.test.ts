import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), board: vi.fn(), totals: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.user }));
vi.mock("@/lib/competitive-rating", () => ({ competitiveLeaderboard: mocks.board }));
vi.mock("@/lib/geography-challenge-totals", () => ({ geographyChallengeTotals: mocks.totals }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockReturnValue("owner"); mocks.board.mockResolvedValue({ rows: [], me: null }); });
it("requires authentication for competitive ratings", async () => {
  mocks.user.mockReturnValue(null);
  expect((await GET(new Request("https://test/api/leaderboard?board=competitive&type=COUNTRY"))).status).toBe(401);
  expect(mocks.board).not.toHaveBeenCalled();
});
it("rejects games without competitive ratings", async () => {
  expect((await GET(new Request("https://test/api/leaderboard?board=competitive&type=PHRASE_HUNT"))).status).toBe(400);
  expect(mocks.board).not.toHaveBeenCalled();
});
it("gets the current rating board for each supported game, independent of period", async () => {
  for (const type of ["COUNTRY", "IRAN_CITY", "LETTER_DUEL"]) {
    const response = await GET(new Request(`https://test/api/leaderboard?board=competitive&type=${type}&period=week&userId=other`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.board).toHaveBeenLastCalledWith("owner", type);
  }
});

it("keeps geographic challenge totals separate from practice and forwards the chosen period", async () => {
  mocks.totals.mockResolvedValue({ rows: [], me: null });
  for (const type of ["COUNTRY", "IRAN_CITY"]) for (const period of ["week", "all"]) {
    const response = await GET(new Request(`https://test/api/leaderboard?board=challenge&type=${type}&period=${period}`));
    expect(response.status).toBe(200);
    expect(mocks.totals).toHaveBeenLastCalledWith("owner", type, period);
  }
});
