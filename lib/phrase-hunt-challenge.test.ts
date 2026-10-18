import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({
  challenge: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  game: { updateMany: vi.fn(), upsert: vi.fn(), findUniqueOrThrow: vi.fn() },
}));
vi.mock("./prisma", () => ({ prisma: { phraseHuntChallenge: mocks.challenge, gameSession: mocks.game } }));
import { currentPhraseChallenge, currentPhraseGame } from "./phrase-hunt-challenge";
const challenge = { id: "2026-10-16T08:30:00.000Z", startsAt: new Date("2026-10-16T08:30Z"), endsAt: new Date("2026-10-16T20:30Z"), targetId: "ph-002", judgeVersion: 4, judgeModel: "google/gemini-embedding-2" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.challenge.findUnique.mockResolvedValue(challenge);
  mocks.challenge.findMany.mockResolvedValue([{ targetId: "ph-001" }]);
  mocks.challenge.upsert.mockImplementation(async ({ create }) => create);
  mocks.game.updateMany.mockResolvedValue({ count: 0 });
});
describe("shared challenge sessions", () => {
  it("reuses the shared target rather than picking per user", async () => {
    expect(await currentPhraseChallenge()).toEqual(challenge);
    expect(mocks.challenge.upsert).not.toHaveBeenCalled();
  });
  it("avoids recent targets when provisioning a new challenge", async () => {
    mocks.challenge.findUnique.mockResolvedValue(null);
    const next = await currentPhraseChallenge(new Date("2026-10-16T12:00Z"));
    expect(next.targetId).not.toBe("ph-001");
    expect(next.judgeVersion).toBe(6);
    expect(next.judgeModel).toBe("typesafe/jev-1.13");
    expect(mocks.challenge.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: challenge.id }, update: {} }));
  });
  it("uses the first shared target when simultaneous provisioning races", async () => {
    mocks.challenge.findUnique.mockResolvedValueOnce(null);
    mocks.challenge.upsert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
    mocks.challenge.findUniqueOrThrow.mockResolvedValueOnce(challenge);
    expect(await currentPhraseChallenge(new Date("2026-10-16T12:00Z"))).toEqual(challenge);
  });
  it("returns the same game after win or surrender instead of rerolling", async () => {
    for (const status of ["ACTIVE", "WON", "SURRENDERED"]) {
      const game = { id: "same-game", status };
      mocks.game.upsert.mockResolvedValueOnce(game);
      expect(await currentPhraseGame("player")).toEqual(game);
      expect(mocks.game.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { userId_phraseChallengeId: { userId: "player", phraseChallengeId: challenge.id } }, update: {},
        create: expect.objectContaining({ targetId: challenge.targetId, phraseChallengeId: challenge.id }),
      }));
    }
  });
  it("resolves concurrent starts using the unique user/challenge session", async () => {
    mocks.game.upsert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
    mocks.game.findUniqueOrThrow.mockResolvedValueOnce({ id: "winner-session" });
    expect(await currentPhraseGame("player")).toEqual({ id: "winner-session" });
  });
});
