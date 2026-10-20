import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { phraseHuntJudgment: mocks } }));
import { cosineSimilarity, judgePhrase, normalizePhraseGuess, parsePhraseScore, PHRASE_HUNT_JUDGE_MODEL, PHRASE_HUNT_JUDGE_VERSION, scoreEmbeddingSimilarity } from "./phrase-hunt-judge";
import { phraseHuntTargets } from "./data/phrase-hunt-targets";
import { normalizePersian } from "./geo";

describe("Phrase Hunt phrase judging primitives", () => {
  it("normalizes Persian character variants and spacing consistently", () => {
    expect(normalizePhraseGuess("  دانش‌آموز  ")).toBe("دانش آموز");
    expect(normalizePhraseGuess("كِتاب")).toBe("کتاب");
  });

  it("parses the legacy JEV score format for challenges pinned to older versions", () => {
    expect(parsePhraseScore(0)).toBe(0);
    expect(parsePhraseScore(4)).toBe(99);
    expect(parsePhraseScore(3.72)).toBe(92.07);
    expect(parsePhraseScore(3.086)).toBe(76.38);
    for (const value of [undefined, null, "3.72", NaN, Infinity, -0.1, 4.01]) {
      expect(() => parsePhraseScore(value)).toThrow("JEV_UNAVAILABLE");
    }
  });

  it("uses cosine similarity directly, shown as a percentage without remapping", () => {
    expect(cosineSimilarity([1, 0], [0.8, 0.6])).toBeCloseTo(0.8);
    expect(scoreEmbeddingSimilarity(0.8439)).toBe(84.39);
    expect(scoreEmbeddingSimilarity(0)).toBe(0);
    expect(scoreEmbeddingSimilarity(-0.2)).toBe(-20);
  });

  it("rejects invalid embeddings and cosine values", () => {
    for (const [a, b] of [[[], []], [[0, 0], [1, 0]], [[1], [1, 2]], [[1, NaN], [1, 0]]] as const) {
      expect(() => cosineSimilarity(a, b)).toThrow("JEV_UNAVAILABLE");
    }
    expect(() => scoreEmbeddingSimilarity(1.01)).toThrow("JEV_UNAVAILABLE");
  });

  it("has unique stable targets with short answer variants", () => {
    expect(phraseHuntTargets.length).toBeGreaterThan(0);
    expect(new Set(phraseHuntTargets.map((target) => target.id)).size).toBe(phraseHuntTargets.length);
    const answers = phraseHuntTargets.flatMap((target) => [target.phrase, ...target.aliases]).map(normalizePersian);
    expect(new Set(answers).size).toBe(answers.length);
    expect(phraseHuntTargets.every((target) => target.phrase.split(" ").length <= 5)).toBe(true);
  });
});

describe("Gemini Embedding 2 challenges pinned to version 4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("JEV_API_KEY", "legacy-key");
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("embeds target and normalized guess together, calculates cosine, and caches the raw similarity percentage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { index: 0, embedding: [1, 0] }, { index: 1, embedding: [0.8, 0.6] },
    ] }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await judgePhrase("ph-001", "هوای پاک", "  هواي سالم  ", 4, "google/gemini-embedding-2")).toBe(80);
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/embeddings", expect.objectContaining({
      headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-embedding-2", input: ["هوای پاک", "هوای سالم"], dimensions: 768, encoding_format: "float" }),
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ targetId: "ph-001", phrase: "هوای سالم", score: 80, judgeVersion: 4, model: "google/gemini-embedding-2" }),
    }));
  });

  it("uses the versioned embedding cache without calling OpenRouter", async () => {
    mocks.findUnique.mockResolvedValue({ score: 76.25 });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await judgePhrase("ph-001", "هوای پاک", "نسیم", 4, "google/gemini-embedding-2")).toBe(76.25);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { targetId_phrase_judgeVersion_model: {
      targetId: "ph-001", phrase: "نسیم", judgeVersion: 4, model: "google/gemini-embedding-2",
    } } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed and never caches invalid or unavailable embedding responses", async () => {
    for (const response of [
      { ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 0] }] }) },
      { ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 0] }, { index: 1, embedding: [0, 0] }] }) },
      { ok: false, json: async () => ({}) },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(judgePhrase("ph-001", "هوای پاک", "نسیم", 4, "google/gemini-embedding-2")).rejects.toThrow("JEV_UNAVAILABLE");
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(judgePhrase("ph-001", "هوای پاک", "نسیم", 4, "google/gemini-embedding-2")).rejects.toThrow("JEV_UNAVAILABLE");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("JEV-pinned challenge judging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JEV_API_KEY", "legacy-key");
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("preserves the v5 JEV judge while new challenges default to v6", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { type: "score", score: 2.5 } } }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(PHRASE_HUNT_JUDGE_VERSION).toBe(6);
    expect(PHRASE_HUNT_JUDGE_MODEL).toBe("typesafe/jev-1.13");
    expect(await judgePhrase("ph-001", "هوای پاک", "نسیم", 5)).toBe(61.88);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("typesafe/jev-1.13");
    expect(request.questions.score.criteria).toHaveLength(5);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ judgeVersion: 5, model: "typesafe/jev-1.13", score: 61.88 }) }));
  });

  it("keeps an old challenge on its original five-level JEV judge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { type: "score", score: 3.72 } } }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await judgePhrase("ph-001", "هوای پاک", "  هواي سالم  ", 3, "typesafe/jev-1.13")).toBe(92.07);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.state.submitted_phrase).toBe("هوای سالم");
    expect(request.questions.score).toMatchObject({ type: "score" });
    expect(request.questions.score.criteria).toHaveLength(5);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ phrase: "هوای سالم", score: 92.07, judgeVersion: 3 }) }));
  });

  it("keeps v1 sessions on their original choice judge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { choice: "S90" } } }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await judgePhrase("ph-001", "هوای پاک", "هوای سالم", 1, "typesafe/jev-1.12")).toBe(90);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).questions.score.type).toBe("choice");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ judgeVersion: 1, score: 90 }) }));
  });

  it.each(["invalid", "offline", "timeout"])("never caches %s legacy model results", async (failure) => {
    vi.stubGlobal("fetch", failure === "invalid"
      ? vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answers: { score: { score: 99 } } }) })
      : vi.fn().mockRejectedValue(new Error(failure)));
    await expect(judgePhrase("ph-001", "هوای پاک", "نسیم", 3, "typesafe/jev-1.13")).rejects.toThrow("JEV_UNAVAILABLE");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
