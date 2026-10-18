import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  wordWeaverRound: { findUnique: vi.fn() },
  wordWeaverBotTurn: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  wordWeaverPresence: { findFirst: vi.fn() },
  wordWeaverEntry: { upsert: vi.fn() },
}));
vi.mock("./prisma", () => ({ prisma: db }));
import { claimWordWeaverBotTurn, generateWordWeaverBotText, submitWordWeaverBotText } from "./word-weaver-bots";
import { selectWordWeaverWinners, wordWeaverActor } from "./word-weaver-personas";

const job = { id: "job", roundId: "round", personaId: "jalal", leaseToken: "current-lease" };

describe("word-weaver AI players", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "باران، عرقِ پیشانیِ آسمان بود." } }] }));
    db.$transaction.mockImplementation((callback) => callback(db));
    db.wordWeaverRound.findUnique.mockResolvedValue({ status: "WRITING", writeDeadline: new Date(Date.now() + 30000) });
    db.wordWeaverBotTurn.findUnique.mockResolvedValue({ status: "GENERATING", leaseToken: job.leaseToken });
    db.wordWeaverPresence.findFirst.mockResolvedValue({ id: "presence" });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each(["jalal", "camus"])("generates one independent %s entry with the requested model", async (persona) => {
    await expect(generateWordWeaverBotText(persona, "باران")).resolves.toBe("باران، عرقِ پیشانیِ آسمان بود.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("openai/gpt-6-luna");
    expect(request.messages).toHaveLength(2);
    expect(JSON.parse(request.messages[1].content)).toEqual({ word: "باران" });
    expect(request.messages[0].content).toContain(persona === "jalal" ? "جلال آل‌احمد" : "آلبر کامو");
  });

  it("rejects invalid long output without regenerating a better candidate", async () => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ message: { content: "آ".repeat(201) } }] }));
    await expect(generateWordWeaverBotText("jalal", "باران")).rejects.toThrow("BOT_TEXT_INVALID");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not pretend a generation failure is a submitted player", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(generateWordWeaverBotText("camus", "باران")).rejects.toThrow("BOT_GENERATION_HTTP_503");
    expect(db.wordWeaverEntry.upsert).not.toHaveBeenCalled();
  });

  it("submits publicly exactly once per persona/round without creating a Telegram user", async () => {
    expect(await submitWordWeaverBotText(job, "باران می‌بارید")).toBe(true);
    expect(db.wordWeaverEntry.upsert).toHaveBeenCalledWith({
      where: { roundId_botPersonaId: { roundId: "round", botPersonaId: "jalal" } },
      create: { roundId: "round", botPersonaId: "jalal", text: "باران می‌بارید" }, update: {},
    });
  });

  it("ignores a stale generation lease so an old response cannot overwrite a new one", async () => {
    db.wordWeaverBotTurn.findUnique.mockResolvedValue({ status: "GENERATING", leaseToken: "new-lease" });
    expect(await submitWordWeaverBotText(job, "متن قدیمی")).toBe(false);
    expect(db.wordWeaverEntry.upsert).not.toHaveBeenCalled();
    expect(db.wordWeaverBotTurn.update).not.toHaveBeenCalled();
  });

  it.each(["JUDGING", "CLOSED"])("does not submit after writing changes to %s", async (status) => {
    db.wordWeaverRound.findUnique.mockResolvedValue({ status, writeDeadline: new Date(Date.now() + 30000) });
    expect(await submitWordWeaverBotText(job, "متن دیررس")).toBe(false);
    expect(db.wordWeaverEntry.upsert).not.toHaveBeenCalled();
  });

  it("does not submit past the deadline or without any humans present", async () => {
    db.wordWeaverRound.findUnique.mockResolvedValue({ status: "WRITING", writeDeadline: new Date(0) });
    expect(await submitWordWeaverBotText(job, "متن دیررس")).toBe(false);
    db.wordWeaverRound.findUnique.mockResolvedValue({ status: "WRITING", writeDeadline: new Date(Date.now() + 30000) });
    db.wordWeaverPresence.findFirst.mockResolvedValue(null);
    expect(await submitWordWeaverBotText(job, "اتاق خالی")).toBe(false);
    expect(db.wordWeaverEntry.upsert).not.toHaveBeenCalled();
  });

  it("recovers abandoned generation with a new lease and the persisted model", async () => {
    db.wordWeaverBotTurn.findFirst.mockResolvedValue({ ...job, model: "openai/gpt-6-luna", status: "GENERATING", attempts: 1 });
    db.wordWeaverBotTurn.updateMany.mockResolvedValue({ count: 1 });
    const claimed = await claimWordWeaverBotTurn("round");
    expect(claimed?.model).toBe("openai/gpt-6-luna");
    expect(claimed?.leaseToken).not.toBe(job.leaseToken);
    expect(db.wordWeaverBotTurn.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ attempts: { lt: 2 }, OR: [{ status: "PENDING" }, { status: "GENERATING", leaseUntil: { lt: expect.any(Date) } }] }) }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not generate if another worker wins the claim", async () => {
    db.wordWeaverBotTurn.findFirst.mockResolvedValue({ ...job, model: "openai/gpt-6-luna" });
    db.wordWeaverBotTurn.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimWordWeaverBotTurn("round")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can award a bot first place while reserving next-word selection for the best human", () => {
    const scores = [{ id: "bot", userId: null, finalScore: 9900 }, { id: "human1", userId: "a", finalScore: 6000 }, { id: "human2", userId: "b", finalScore: 8000 }];
    expect(selectWordWeaverWinners(scores, () => 0)).toEqual({ winner: scores[0], nextWordPickerUserId: "b" });
    expect(selectWordWeaverWinners(scores.slice(0, 1), () => 0).nextWordPickerUserId).toBeNull();
  });

  it("keeps the selected human winner as the picker in a tied human/bot result", () => {
    const scores = [{ id: "bot", userId: null, finalScore: 9000 }, { id: "human", userId: "a", finalScore: 9000 }];
    expect(selectWordWeaverWinners(scores, () => 1)).toEqual({ winner: scores[1], nextWordPickerUserId: "a" });
  });

  it("labels both personas as bots and never supplies a fake Telegram username", () => {
    expect(wordWeaverActor({ user: null, botPersonaId: "camus" })).toMatchObject({ displayName: "آلبر کامو", isBot: true, username: null });
    expect(wordWeaverActor({ user: null, botPersonaId: "jalal" })).toMatchObject({ displayName: "جلال آل‌احمد", isBot: true });
  });
});
