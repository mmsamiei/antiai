import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  wordWeaverRoom: { upsert: vi.fn() },
  wordWeaverRound: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  wordWeaverPresence: { findFirst: vi.fn() },
  wordWeaverEntry: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("./prisma", () => ({ prisma: db }));
import { getWordWeaverResults, getWordWeaverState, submitWordWeaverEntry, chooseWordWeaverNextWord } from "./word-weaver";

const publicUser = (id: string) => ({ id, firstName: id, lastName: null, username: null, photoUrl: null });
const entry = (id: string, score: number | null, userId = id) => ({
  id, userId, roundId: "round", text: `نوشتهٔ ${id}`, finalScore: score,
  status: score === null ? "FAILED" : "SCORED", failureMessage: score === null ? "داوری انجام نشد" : null,
  relevanceScore: score === null ? null : 3, originalityScore: score === null ? null : 3, expressionScore: score === null ? null : 3,
  user: publicUser(userId),
});
const round = () => ({ id: "round", number: 2, status: "WRITING", word: "باران", writeDeadline: new Date(Date.now() + 30_000), revealUntil: null, isSolo: false, winnerUserId: null, winningEntryId: null, nextWord: null });

describe("word-weaver final submissions and compact results", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.wordWeaverRoom.upsert.mockResolvedValue({ currentRoundId: "round" });
    db.wordWeaverRound.findUnique.mockResolvedValue(round());
    db.wordWeaverRound.findFirst.mockResolvedValue({ ...round(), status: "RESULTS", winningEntryId: "winner", winnerUserId: "winner" });
    db.$transaction.mockImplementation((callback) => callback(db));
    db.$queryRaw.mockResolvedValue([{ count: 2n }]);
    db.wordWeaverPresence.findFirst.mockResolvedValue({ userId: "me" });
    db.wordWeaverEntry.findUnique.mockResolvedValue(null);
    db.wordWeaverEntry.findMany.mockResolvedValue([]);
    db.wordWeaverEntry.count.mockResolvedValue(0);
  });

  it("creates a final submission once and rejects attempts to edit it", async () => {
    const saved = { text: "باران آواز آسمان است", status: "PENDING", submittedAt: new Date() };
    db.wordWeaverEntry.create.mockResolvedValue(saved);
    expect(await submitWordWeaverEntry("me", saved.text)).toEqual(saved);
    expect(db.wordWeaverEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: { roundId: "round", userId: "me", text: saved.text } }));
    db.wordWeaverEntry.findUnique.mockResolvedValue(saved);
    expect(await submitWordWeaverEntry("me", saved.text)).toEqual(saved);
    await expect(submitWordWeaverEntry("me", "نوشتهٔ جایگزین")).rejects.toThrow("ENTRY_ALREADY_SUBMITTED");
    expect(db.wordWeaverEntry.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a submission at the writing deadline", async () => {
    db.wordWeaverRound.findUnique.mockResolvedValue({ ...round(), writeDeadline: new Date(0) });
    await expect(submitWordWeaverEntry("me", "باران تازه")).rejects.toThrow("ROUND_NOT_WRITING");
    expect(db.wordWeaverEntry.create).not.toHaveBeenCalled();
  });

  it("publishes current final texts and names, without leaking scores during writing or judging", async () => {
    db.wordWeaverEntry.findMany.mockResolvedValue([entry("other", 8000)]);
    for (const status of ["WRITING", "JUDGING"]) {
      db.wordWeaverRound.findUnique.mockResolvedValue({ ...round(), status });
      const state = await getWordWeaverState("me");
      expect(state.latestResult).toBeNull();
      expect(state.round?.submittedEntries).toEqual([{ id: "other", text: "نوشتهٔ other", user: { id: "other", displayName: "other", username: null, photoUrl: null, isBot: false } }]);
      expect(state.round?.submittedEntries[0]).not.toHaveProperty("score");
      expect(state.round?.submittedEntries[0]).not.toHaveProperty("status");
    }
  });

  it("returns the persisted winner, two other leaders, and the viewer's true overall rank", async () => {
    db.wordWeaverEntry.findMany.mockResolvedValue([entry("second", 9000), entry("third", 8000)]);
    db.wordWeaverEntry.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === "winner" ? entry("winner", 9500) : entry("own", 5000, "me")));
    db.wordWeaverEntry.count.mockImplementation(({ where }) => Promise.resolve(where.finalScore.gt === 5000 ? 17 : where.finalScore.gt === 9000 ? 1 : where.finalScore.gt === 8000 ? 2 : 0));
    const result = await getWordWeaverResults("round", "me");
    expect(result.results.map((item) => item.id)).toEqual(["winner", "second", "third", "own"]);
    expect(result.results[3]).toMatchObject({ rank: 18, score: 50, isMe: true });
    expect(result.results[0]).toMatchObject({ rank: 1, isWinner: true });
  });

  it("does not duplicate the viewer if already in the top three", async () => {
    db.wordWeaverEntry.findMany.mockResolvedValue([entry("second", 9000, "me"), entry("third", 8000)]);
    db.wordWeaverEntry.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === "winner" ? entry("winner", 9500) : entry("second", 9000, "me")));
    const result = await getWordWeaverResults("round", "me");
    expect(result.results).toHaveLength(3);
    expect(result.results.filter((item) => item.isMe)).toHaveLength(1);
  });

  it("shows a failed own entry without a rank, and never invents a top entry", async () => {
    db.wordWeaverRound.findFirst.mockResolvedValue({ id: "round", winningEntryId: null, winnerUserId: null });
    db.wordWeaverEntry.findUnique.mockResolvedValue(entry("own", null, "me"));
    const result = await getWordWeaverResults("round", "me");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ score: null, rank: null, isMe: true });
  });

  it("shows a bot winner while giving the human picker permission, including one-human rounds", async () => {
    db.wordWeaverRound.findUnique.mockResolvedValue({ ...round(), status: "RESULTS", isSolo: true, winningEntryId: "bot", nextWordPickerUserId: "me", revealUntil: new Date(Date.now() + 10000) });
    db.wordWeaverEntry.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === "bot" ? { ...entry("bot", 9800), userId: null, user: null, botPersonaId: "camus" } : null));
    db.user.findUnique.mockResolvedValue(publicUser("me"));
    const state = await getWordWeaverState("me");
    expect(state.latestResult).toMatchObject({ winner: { displayName: "آلبر کامو", isBot: true }, nextWordPicker: { id: "me", isBot: false }, canChooseNextWord: true });
    db.wordWeaverRound.updateMany.mockResolvedValue({ count: 1 });
    expect(await chooseWordWeaverNextWord("me", "خورشید")).toBe("خورشید");
    await expect(chooseWordWeaverNextWord("other-human", "خورشید")).rejects.toThrow("PICK_NOT_ALLOWED");
  });

  it("includes a bot in the top three without treating it as the current human", async () => {
    const bot = { ...entry("winner", 9800), userId: null, user: null, botPersonaId: "jalal" };
    db.wordWeaverEntry.findMany.mockResolvedValue([entry("second", 9000), entry("third", 8000)]);
    db.wordWeaverEntry.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === "winner" ? bot : entry("own", 5000, "me")));
    const results = await getWordWeaverResults("round", "me");
    expect(results.results).toHaveLength(4);
    expect(results.results[0]).toMatchObject({ isWinner: true, isMe: false, user: { isBot: true, displayName: "جلال آل‌احمد" } });
    expect(results.results[3].isMe).toBe(true);
  });

  it("does not expose result scores before the round is resolved", async () => {
    db.wordWeaverRound.findFirst.mockResolvedValue(null);
    await expect(getWordWeaverResults("round", "me")).rejects.toThrow("RESULT_NOT_READY");
    expect(db.wordWeaverEntry.findMany).not.toHaveBeenCalled();
  });
});
