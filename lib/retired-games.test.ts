import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(), findFirst: vi.fn(), transaction: vi.fn(), update: vi.fn(), judge: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("./prisma", () => ({ prisma: { gameSession: { findFirst: mocks.findFirst, update: mocks.update }, $transaction: mocks.transaction } }));
vi.mock("./adjective-judge", () => ({ judgeAdjective: mocks.judge }));
import { activeOrNewGame, GAME_TYPES, parseGameType, parseLeaderboardGameType } from "./game-service";
import { POST as start } from "../app/api/game/start/route";
import { GET as resume } from "../app/api/game/route";
import { POST as guess } from "../app/api/game/guess/route";
import { POST as surrender } from "../app/api/game/surrender/route";

function request(body: unknown) {
  return new Request("http://localhost/api/game", { method: "POST", body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.currentUserId.mockReturnValue("owner"); });

describe.each(["ADJECTIVE", "ADJECTIVE_RAIN"] as const)("retired %s", (type) => {
  it("rejects start and resume before accessing sessions", async () => {
    expect(parseGameType(type)).toBeNull();
    expect((await start(request({ type }))).status).toBe(400);
    expect((await resume(new Request(`http://localhost/api/game?type=${type}`))).status).toBe(400);
    await expect(activeOrNewGame("owner", type)).rejects.toThrow("GAME_RETIRED");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("preserves historical leaderboard validation", () => {
    expect(parseLeaderboardGameType(type)).toBe(type);
  });
  it.each([guess, surrender])("rejects owned sessions without judging or writing", async (handler) => {
    mocks.findFirst.mockResolvedValue({ id: "old-game", type, status: "ACTIVE" });
    const response = await handler(request({ gameId: "old-game", word: "خوشحال", clue: "سرنخ" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "واژه‌جو دیگر در دسترس نیست" });
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "old-game", userId: "owner" } });
    expect(mocks.judge).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
it("keeps six playable game types including animals", () => {
  expect(GAME_TYPES).toEqual(["ANIMAL", "IRAN_CITY", "COUNTRY", "PHRASE_HUNT", "SEMANTRIS", "LETTER_DUEL"]);
  for (const type of GAME_TYPES) expect(parseGameType(type)).toBe(type);
});
it.each([start, guess, surrender])("requires authentication", async (handler) => {
  mocks.currentUserId.mockReturnValue(null);
  expect((await handler(request({ type: "ADJECTIVE_RAIN", gameId: "old-game" }))).status).toBe(401);
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
it("does not disclose another user's retired session", async () => {
  mocks.findFirst.mockResolvedValue(null);
  expect((await surrender(request({ gameId: "someone-elses-game" }))).status).toBe(404);
  expect(mocks.update).not.toHaveBeenCalled();
});
