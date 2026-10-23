import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  initialFindUnique: vi.fn(),
  txFindFirst: vi.fn(),
  txFindUnique: vi.fn(),
  txCount: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  judge: vi.fn(),
  lockUser: vi.fn(),
  readState: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gameSession: { findFirst: mocks.findFirst },
    phraseHuntGuess: { count: mocks.count, findUnique: mocks.initialFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/phrase-hunt-judge", () => ({
  judgePhrase: mocks.judge,
  PHRASE_HUNT_JUDGE_VERSION: 3,
  normalizePhraseGuess: (value: string) => value.normalize("NFKC").replace(/[ـ‌]/g, " ").replace(/\s+/g, " ").trim().replaceAll("ي", "ی").replaceAll("ك", "ک"),
}));

vi.mock("@/lib/phrase-hunt-guess-state", () => ({ readPhraseHuntGuessState: mocks.readState }));
import { phraseChallengeWindow } from "@/lib/phrase-hunt-schedule";
import { POST } from "./route";

const game = {
  id: "game-1", userId: "player", type: "PHRASE_HUNT", targetId: "ph-001", datasetVersion: "v1",
  phraseChallengeId: "2026-10-16T08:30:00.000Z", phraseChallenge: { judgeVersion: 3, judgeModel: "typesafe/jev-1.13" },
  status: "ACTIVE", guessesCount: 0, startedAt: new Date(), finishedAt: null, semantrisState: null,
  letterDuelRoundId: null, duelOwnScore: null, duelOpponentScore: null,
  guesses: [], phraseGuesses: [],
};
type TransactionMocks = {
  gameSession: { findFirst: typeof mocks.txFindFirst; update: typeof mocks.update };
  phraseHuntGuess: { findUnique: typeof mocks.txFindUnique; count: typeof mocks.txCount; create: typeof mocks.create };
};
const tx = {
  $queryRaw: mocks.lockUser,
  gameSession: { findFirst: mocks.txFindFirst, update: mocks.update },
  phraseHuntGuess: { findUnique: mocks.txFindUnique, count: mocks.txCount, create: mocks.create },
};
const request = (body: unknown) => new Request("https://example.test/api/phrase-hunt/guess", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  // Existing fixture controls describe the state returned by the single SQL read.
  mocks.readState.mockImplementation(async (client, gameId, userId, phrase) => {
    const transactional = client === tx;
    const state = await (transactional ? mocks.txFindFirst : mocks.findFirst)({ where: { phraseChallengeId: phraseChallengeWindow().id } });
    if (!state) return null;
    return { ...state,
      duplicate: Boolean(await (transactional ? mocks.txFindUnique : mocks.initialFindUnique)()),
      recentCount: await (transactional ? mocks.txCount : mocks.count)(),
    };
  });
  mocks.currentUserId.mockReturnValue("player");
  mocks.findFirst.mockResolvedValue({ ...game, phraseGuesses: [] });
  mocks.count.mockResolvedValue(0);
  mocks.initialFindUnique.mockResolvedValue(null);
  mocks.lockUser.mockResolvedValue([{ id: "player" }]);
  mocks.txFindFirst.mockResolvedValue(game);
  mocks.txFindUnique.mockResolvedValue(null);
  mocks.txCount.mockResolvedValue(0);
  mocks.create.mockImplementation(async ({ data }) => ({ id: "guess-1", ...data, createdAt: new Date() }));
  mocks.update.mockImplementation(async ({ data }) => ({
    ...game, ...data,
    phraseGuesses: [{ id: "guess-1", phrase: "هوای تمیز", score: mocks.create.mock.calls[0]?.[0]?.data.score ?? 76.38, createdAt: new Date() }],
  }));
  mocks.transaction.mockImplementation((callback: (value: TransactionMocks) => unknown) => callback(tx));
  mocks.judge.mockResolvedValue(76.38);
});

afterEach(() => vi.useRealTimers());

describe("POST /api/phrase-hunt/guess", () => {
  it("returns only the new guess for delta clients without loading history", async () => {
    const response = await POST(request({ gameId: game.id, phrase: "نسیم لطیف", responseMode: "delta" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.guess).toMatchObject({ id: "guess-1", name: "نسیم لطیف", score: 76.38 });
    expect(body.game).not.toHaveProperty("phraseGuesses");
    expect(body.game).not.toHaveProperty("bestScore");
    expect(body.game.target).toBeNull();
    expect(mocks.readState).toHaveBeenCalledWith(expect.anything(), game.id, "player", "نسیم لطیف");
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("include");
    expect(mocks.readState).toHaveBeenCalledTimes(2);
  });

  it("reveals the answer on a delta win and keeps legacy snapshots supported", async () => {
    const response = await POST(request({ gameId: game.id, phrase: "هوای تمیز", responseMode: "delta" }));
    expect(await response.json()).toMatchObject({ won: true, guess: { score: 100 }, game: { status: "WON", target: { name: "هوای پاک" } } });
    const legacy = await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }));
    expect((await legacy.json()).game.phraseGuesses).toHaveLength(1);
    expect(mocks.update.mock.calls[1][0].include.phraseGuesses).toBeDefined();
  });

  it("locks the authenticated player before reading transaction state at Read Committed", async () => {
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000 });
    expect(mocks.lockUser.mock.calls[0][1]).toBe("player");
    expect(mocks.lockUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.txFindFirst.mock.invocationCallOrder[0]);
  });

  it("does not write when the player disappeared while judging", async () => {
    mocks.lockUser.mockResolvedValue([]);
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(409);
    expect(mocks.txFindFirst).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("checks the challenge again after waiting for the player lock", async () => {
    mocks.lockUser.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-10-16T20:30:00Z"));
      return [{ id: "player" }];
    });
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires authentication and valid bounded text", async () => {
    mocks.currentUserId.mockReturnValue(null);
    expect((await POST(request({ gameId: "game-1", phrase: "هوای پاک" }))).status).toBe(401);
    mocks.currentUserId.mockReturnValue("player");
    expect((await POST(request({ gameId: "game-1", phrase: "   " }))).status).toBe(400);
    expect((await POST(request({ gameId: "game-1", phrase: "الف ".repeat(13) }))).status).toBe(400);
  });

  it("scores non-winning guesses and keeps the hidden answer private", async () => {
    const response = await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ score: 76.38, won: false, game: { target: null, phraseGuesses: [{ score: 76.38 }] } });
    expect(JSON.stringify(body)).not.toContain("هوای پاک");
    expect(mocks.judge).toHaveBeenCalledWith("ph-001", "هوای پاک", "نسیم لطیف", 3, "typesafe/jev-1.13");
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ normalized: "نسیم لطیف", score: 76.38 }) });
  });

  it("retries a rolled-back commit using the same score without calling JEV again", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
    mocks.transaction.mockImplementationOnce(async (callback: (value: TransactionMocks) => unknown) => {
      await callback(tx);
      throw conflict;
    });
    const pending = POST(request({ gameId: game.id, phrase: "نسیم لطیف" }));
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).score).toBe(76.38);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.judge).toHaveBeenCalledOnce();
    expect(mocks.txFindFirst).toHaveBeenCalledTimes(2);
    expect(mocks.txCount).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls.map(([arg]) => arg.data.score)).toEqual([76.38, 76.38]);
  });

  it("stops after three retries if the conflict persists", async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" }));
    const pending = POST(request({ gameId: game.id, phrase: "نسیم لطیف" }));
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(409);
    expect(mocks.transaction).toHaveBeenCalledTimes(4);
    expect(mocks.judge).toHaveBeenCalledOnce();
  });

  it("rechecks a concurrent duplicate after a conflict and does not insert it again", async () => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" }));
    mocks.txFindUnique.mockResolvedValue({ id: "concurrent-guess" });
    const pending = POST(request({ gameId: game.id, phrase: "نسیم لطیف" }));
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("این عبارت را قبلاً حدس زده‌ای");
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.judge).toHaveBeenCalledOnce();
  });

  it.each(["GAME_NOT_ACTIVE", "RATE_LIMITED", "CHALLENGE_ENDED"])("does not retry a validation failure after a conflict (%s)", async (message) => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" }));
    if (message === "GAME_NOT_ACTIVE") mocks.txFindFirst.mockResolvedValue(null);
    if (message === "RATE_LIMITED") mocks.txCount.mockResolvedValue(30);
    if (message === "CHALLENGE_ENDED") mocks.transaction.mockImplementationOnce(async (callback: (value: TransactionMocks) => unknown) => {
      vi.setSystemTime(new Date("2026-10-16T20:30:00Z"));
      return callback(tx);
    });
    const pending = POST(request({ gameId: game.id, phrase: "نسیم لطیف" }));
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(message === "RATE_LIMITED" ? 429 : 409);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.judge).toHaveBeenCalledOnce();
  });

  it("does not retry unrelated database errors", async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }));
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(409);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.judge).toHaveBeenCalledOnce();
  });

  it("passes authenticated challenge/player context only to the v6 judge", async () => {
    mocks.findFirst.mockResolvedValue({ ...game, phraseChallenge: { judgeVersion: 6, judgeModel: "typesafe/jev-1.13" } });
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(200);
    expect(mocks.judge).toHaveBeenCalledWith("ph-001", "هوای پاک", "نسیم لطیف", 6, "typesafe/jev-1.13", { challengeId: game.phraseChallengeId, userId: "player" });
  });

  it.each([12, 29])("accepts another guess after %i successes in the last minute", async (count) => {
    mocks.count.mockResolvedValue(count);
    mocks.txCount.mockResolvedValue(count);
    expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("rejects a 31st guess in the rolling minute before calling the judge", async () => {
    mocks.count.mockResolvedValue(30);
    expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(429);
    expect(mocks.readState).toHaveBeenCalledOnce();
    expect(mocks.judge).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rechecks the 30-guess limit when another request finishes during judging", async () => {
    mocks.count.mockResolvedValue(29);
    mocks.txCount.mockResolvedValue(30);
    expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(429);
    expect(mocks.judge).toHaveBeenCalledOnce();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("preserves the scoring version for games already in progress", async () => {
    mocks.findFirst.mockResolvedValue({ ...game, phraseChallenge: { judgeVersion: 2, judgeModel: "typesafe/jev-1.12" } });
    expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(200);
    expect(mocks.judge).toHaveBeenCalledWith("ph-001", "هوای پاک", "نسیم لطیف", 2, "typesafe/jev-1.12");
  });

  it("wins deterministically for a curated normalized alias without calling JEV", async () => {
    const response = await POST(request({ gameId: "game-1", phrase: "هوای تمیز" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ score: 100, won: true, game: { status: "WON", target: { name: "هوای پاک" } } });
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it("does not save a repeated guess or a guess after JEV fails", async () => {
    mocks.initialFindUnique.mockResolvedValueOnce({ id: "previous" });
    expect((await POST(request({ gameId: "game-1", phrase: "هوای تمیز" }))).status).toBe(409);
    expect(mocks.judge).not.toHaveBeenCalled();

    mocks.findFirst.mockResolvedValue({ ...game, phraseGuesses: [] });
    mocks.judge.mockRejectedValue(new Error("JEV_UNAVAILABLE"));
    expect((await POST(request({ gameId: "game-1", phrase: "هوای بارانی" }))).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects expired and legacy sessions without calling JEV", async () => {
    for (const id of [null, "2026-10-15T20:30:00.000Z"]) {
      mocks.findFirst.mockResolvedValue({ ...game, phraseChallengeId: id });
      expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(409);
    }
    expect(mocks.judge).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts guesses through the temporary 10 PM delay and rejects them at 11 PM", async () => {
    const next = { ...game, phraseChallengeId: "2026-10-18T06:30:00.000Z" };
    vi.setSystemTime(new Date("2026-10-18T06:30:00Z"));
    mocks.findFirst.mockResolvedValue(next);
    mocks.txFindFirst.mockResolvedValue(next);
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-18T18:30:00Z"));
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-18T19:30:00Z"));
    expect((await POST(request({ gameId: game.id, phrase: "نسیم لطیف" }))).status).toBe(409);
    expect(mocks.judge).toHaveBeenCalledTimes(2);
  });

  it("rejects another owner's game without judging", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await POST(request({ gameId: "other-game", phrase: "نسیم لطیف" }))).status).toBe(409);
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it("does not commit a guess if the challenge changes while the model runs", async () => {
    mocks.judge.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-10-16T20:30:00Z"));
      return 76.38;
    });
    mocks.txFindFirst.mockImplementationOnce(async ({ where }) => where.phraseChallengeId === game.phraseChallengeId ? game : null);
    expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not commit if surrender or another identical guess wins the race", async () => {
    mocks.txFindFirst.mockResolvedValueOnce(null);
    expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(409);
    mocks.txFindUnique.mockResolvedValueOnce({ id: "concurrent" });
    expect((await POST(request({ gameId: "game-1", phrase: "نسیم لطیف" }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

});
