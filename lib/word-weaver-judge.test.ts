import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { wordWeaverEntry: { updateMany } } }));

import { judgeWordWeaverEntry } from "./word-weaver-judge";

const entry = { id: "entry-1", roundId: "round-1", text: "طلای سیاه", round: { word: "نفت", judgeModel: "test-judge" } };
const answer = () => Response.json({ answers: {
  relevance: { type: "score", score: 2.54 },
  originality: { type: "score", score: 1.27 },
  expression: { type: "score", score: 2.05 },
} });

describe("word-weaver judging and score persistence", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JEV_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
    updateMany.mockResolvedValue({ count: 1 });
    fetchMock.mockResolvedValue(answer());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("persists successful JEV scores using the actual Prisma column names", async () => {
    await judgeWordWeaverEntry(entry);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: entry.id, roundId: entry.roundId, status: "PENDING" },
      data: { relevanceScore: 2.54, originalityScore: 1.27, expressionScore: 2.05,
        finalScore: 4883, status: "SCORED", judgedAt: expect.any(Date), failureMessage: null },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("test-judge");
    expect(body.state).toEqual({ language: "Persian", seedWord: "نفت", entry: "طلای سیاه" });
    expect(Object.keys(body.questions)).toEqual(["relevance", "originality", "expression"]);
  });

  it("retries a failed JEV call once and stores the successful response", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(answer());
    await judgeWordWeaverEntry(entry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SCORED" }) }));
  });

  it("marks the entry failed only after both JEV attempts fail", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await judgeWordWeaverEntry(entry);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", failureMessage: "داوری انجام نشد" }) }));
    } finally { log.mockRestore(); }
  });

  it("leaves a database failure recoverable instead of reporting failed AI judgment", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(judgeWordWeaverEntry(entry)).rejects.toThrow("database unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls.some(([args]) => args.data.status === "FAILED")).toBe(false);
  });
});
