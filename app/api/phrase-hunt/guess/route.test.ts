import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  txFindFirst: vi.fn(),
  txFindUnique: vi.fn(),
  txCount: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  judge: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gameSession: { findFirst: mocks.findFirst },
    phraseHuntGuess: { count: mocks.count },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/phrase-hunt-judge", () => ({
  judgePhrase: mocks.judge,
  PHRASE_HUNT_JUDGE_VERSION: 3,
  normalizePhraseGuess: (value: string) => value.normalize("NFKC").replace(/[ـ‌]/g, " ").replace(/\s+/g, " ").trim().replaceAll("ي", "ی").replaceAll("ك", "ک"),
}));

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
  gameSession: { findFirst: mocks.txFindFirst, update: mocks.update },
  phraseHuntGuess: { findUnique: mocks.txFindUnique, count: mocks.txCount, create: mocks.create },
};
const request = (body: unknown) => new Request("https://example.test/api/phrase-hunt/guess", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  mocks.currentUserId.mockReturnValue("player");
  mocks.findFirst.mockResolvedValue({ ...game, phraseGuesses: [] });
  mocks.count.mockResolvedValue(0);
  mocks.txFindFirst.mockResolvedValue(game);
  mocks.txFindUnique.mockResolvedValue(null);
  mocks.txCount.mockResolvedValue(0);
  mocks.create.mockResolvedValue({});
  mocks.update.mockImplementation(async ({ data }) => ({
    ...game, ...data,
    phraseGuesses: [{ id: "guess-1", phrase: "هوای تمیز", score: mocks.create.mock.calls[0]?.[0]?.data.score ?? 76.38, createdAt: new Date() }],
  }));
  mocks.transaction.mockImplementation((callback: (value: TransactionMocks) => unknown) => callback(tx));
  mocks.judge.mockResolvedValue(76.38);
});

afterEach(() => vi.useRealTimers());

describe("POST /api/phrase-hunt/guess", () => {
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
    expect(mocks.count).toHaveBeenCalledWith({ where: {
      game: { userId: "player" }, createdAt: { gte: new Date("2026-10-16T11:59:00Z") },
    } });
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
    mocks.findFirst.mockResolvedValue({ ...game, phraseGuesses: [{ normalized: "هوای تمیز" }] });
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
