vi.mock("./shared-judgment", () => ({ sharedJudgment: async (_key: unknown[], read: () => Promise<number | null>, work: () => Promise<number>) => (await read()) ?? work() }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), history: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { phraseHuntJudgment: { findUnique: mocks.findUnique, upsert: mocks.upsert } } }));
vi.mock("./phrase-hunt-history-store", () => ({ loadPhraseHuntHistory: mocks.history }));
import { judgePhrase, contextualPhraseInstructions } from "./phrase-hunt-judge";
import { phraseHuntScoreCache } from "./phrase-hunt-score-cache";

describe("v6 shared contextual judging", () => {
  beforeEach(() => {
    phraseHuntScoreCache.clear();
    vi.clearAllMocks(); vi.stubEnv("JEV_API_KEY", "test-key");
    mocks.findUnique.mockResolvedValue(null);
    mocks.history.mockResolvedValue({ previousGuesses: [{ guess: "جنگ", score_out_of_100: 50 }], counts: {} });
    mocks.upsert.mockImplementation(async ({ create }) => create);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("sends selected history, selected short prompt and five levels in one call without numeric adjustment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { score: 2.5 } } }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await judgePhrase("ph-106", "جنگ روانی", "  تهديد ", 6, "typesafe/jev-1.13", { challengeId: "night", userId: "player" })).toBe(61.88);
    expect(mocks.history).toHaveBeenCalledWith("night", "player", "تهدید");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.state.previous_guesses).toEqual([{ guess: "جنگ", score_out_of_100: 50 }]);
    expect(request.questions.score.instructions).toBe(contextualPhraseInstructions);
    expect(request.questions.score.criteria).toEqual(["بی‌ارتباط", "ارتباط ضعیف", "بخشی از مفهوم درست", "بیشتر مفهوم درست", "تقریباً همان معنا"]);
    expect(JSON.stringify(request)).not.toContain('"player"');
  });
  it("adds only this challenge's score anchors, excludes the current guess, and stays within 200 examples", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { score: 2 } } }) });
    vi.stubGlobal("fetch", fetchMock);
    mocks.history.mockResolvedValue({ previousGuesses: Array.from({ length: 200 }, (_, i) => ({ guess: `حدس ${i}`, score_out_of_100: 60 - i / 10 })), counts: {} });
    await judgePhrase("ph-108", "امید واهی", "امید بیهوده", 6, "typesafe/jev-1.13", { challengeId: "2026-10-21T06:30:00.000Z", userId: "player" });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    const history = request.state.previous_guesses as { guess: string; score_out_of_100: number }[];
    expect(history).toHaveLength(200);
    expect(history.some(item => item.guess === "امید بیهوده")).toBe(false);
    expect(history).toContainEqual({ guess: "امید واهی", score_out_of_100: 100 });
    expect(history).toContainEqual({ guess: "امید بی‌اساس", score_out_of_100: 94 });
    expect(history).toContainEqual({ guess: "واهی", score_out_of_100: 65 });
    expect(history.some(item => item.guess === "سامورایی" || item.guess === "باغ انار")).toBe(false);
    expect(history).not.toContainEqual({ guess: "جنگ", score_out_of_100: 50 });
  });
  it("sends tonight's calibrated AI anchors, overrides prior history, and excludes the submitted guess", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { score: 2 } } }) });
    vi.stubGlobal("fetch", fetchMock);
    mocks.history.mockResolvedValue({ previousGuesses: [{ guess: "هوش", score_out_of_100: 10 }], counts: {} });
    await judgePhrase("ph-071", "هوش مصنوعی", "یادگیری ماشین", 6, "typesafe/jev-1.13", { challengeId: "2026-10-24T18:30:00.000Z", userId: "player" });
    const history = JSON.parse(fetchMock.mock.calls[0][1].body).state.previous_guesses;
    expect(history).toHaveLength(11);
    expect(history).toContainEqual({ guess: "هوش", score_out_of_100: 60 });
    expect(history).toContainEqual({ guess: "مصنوعی", score_out_of_100: 50 });
    expect(history).toContainEqual({ guess: "هوش مصنوعی", score_out_of_100: 100 });
    expect(history.some((item: { guess: string }) => item.guess === "یادگیری ماشین" || item.guess === "پرنیان")).toBe(false);
  });
  it("coalesces concurrent guesses from different users into one provider request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { score: 2 } } }) });
    vi.stubGlobal("fetch", fetchMock);
    const values = await Promise.all(["a", "b", "c"].map(userId => judgePhrase("ph-106", "جنگ روانی", "حدس مشترک", 6, "typesafe/jev-1.13", { challengeId: "night", userId })));
    expect(new Set(values).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("reuses the shared score across players before selecting any personal context or calling JEV", async () => {
    mocks.findUnique.mockResolvedValue({ score: 53.21 });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const userId of ["one", "two"]) expect(await judgePhrase("ph-106", "جنگ روانی", "تهدید", 6, "typesafe/jev-1.13", { challengeId: "night", userId })).toBe(53.21);
    expect(mocks.history).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.findUnique).toHaveBeenCalledOnce();
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { targetId_phrase_judgeVersion_model: { targetId: JSON.stringify(["ph-106", "night"]), phrase: "تهدید", judgeVersion: 6, model: "typesafe/jev-1.13" } }, select: { score: true } });
  });
  it("returns the canonical winning insert if concurrent first judgments disagree", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { score: 3 } } }) }));
    mocks.upsert.mockResolvedValue({ score: 52.22 });
    expect(await judgePhrase("ph-106", "جنگ روانی", "تهدید", 6, "typesafe/jev-1.13", { challengeId: "night", userId: "player" })).toBe(52.22);
  });
  it("recovers a database unique-constraint race using the already saved shared judgment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { score: 3 } } }) }));
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ score: 49.01 });
    mocks.upsert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("race", { code: "P2002", clientVersion: "test" }));
    expect(await judgePhrase("ph-106", "جنگ روانی", "تهدید", 6, "typesafe/jev-1.13", { challengeId: "night", userId: "player" })).toBe(49.01);
  });

  it("requires a challenge and authenticated user context for v6", async () => {
    await expect(judgePhrase("ph-106", "جنگ روانی", "تهدید", 6)).rejects.toThrow("PHRASE_CONTEXT_REQUIRED");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("does not cache failed JEV responses", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ answers: { score: { score: 2 } } }) });
    vi.stubGlobal("fetch", fetch);
    await expect(judgePhrase("ph-106", "جنگ روانی", "تهدید", 6, "typesafe/jev-1.13", { challengeId: "night", userId: "player" })).rejects.toThrow("JEV_UNAVAILABLE");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(await judgePhrase("ph-106", "جنگ روانی", "تهدید", 6, "typesafe/jev-1.13", { challengeId: "night", userId: "player" })).toBe(49.5);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("scopes memory scores to the challenge, target, judge version and model", async () => {
    mocks.findUnique.mockResolvedValue({ score: 0 });
    const request = (challengeId: string, model = "typesafe/jev-1.13", version = 6) => judgePhrase("ph-106", "جنگ روانی", "تهدید", version, model, { challengeId, userId: "player" });
    expect(await request("morning")).toBe(0);
    expect(await request("morning")).toBe(0);
    await request("night");
    await request("morning", "other-model");
    await request("morning", "typesafe/jev-1.13", 7);
    expect(mocks.findUnique).toHaveBeenCalledTimes(4);
  });
});
