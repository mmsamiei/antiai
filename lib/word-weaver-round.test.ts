import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  wordWeaverRound: { findUnique: vi.fn(), update: vi.fn() },
  wordWeaverRoom: { updateMany: vi.fn() },
  wordWeaverEntry: { updateMany: vi.fn() },
  wordWeaverBotTurn: { count: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("./prisma", () => ({ prisma: db }));
import { advanceWordWeaverWritingRound } from "./word-weaver-round";

describe("early word-weaver judging", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.wordWeaverBotTurn.count.mockResolvedValue(0);
    db.$transaction.mockImplementation((callback) => callback(db));
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValue([{ players: 2n, missing: 0n }]);
    db.wordWeaverRound.findUnique.mockResolvedValue({ id: "round", status: "WRITING", writeDeadline: new Date(Date.now() + 30_000) });
  });
  it("starts before the deadline when all distinct present users have submitted", async () => {
    expect(await advanceWordWeaverWritingRound("round")).toBe("JUDGING");
    expect(db.wordWeaverRound.update).toHaveBeenCalledWith({ where: { id: "round" }, data: { status: "JUDGING", judgeStartedAt: expect.any(Date), isSolo: false } });
    expect(db.wordWeaverEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { roundId: "round", status: "PENDING" } }));
  });
  it("waits for a present user even if departed users have submitted", async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValue([{ players: 2n, missing: 1n }]);
    expect(await advanceWordWeaverWritingRound("round")).toBe("WAITING");
    expect(db.wordWeaverRound.update).not.toHaveBeenCalled();
  });
  it("starts after the deadline even if some present users have not submitted", async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValue([{ players: 2n, missing: 1n }]);
    db.wordWeaverRound.findUnique.mockResolvedValue({ status: "WRITING", writeDeadline: new Date(0) });
    expect(await advanceWordWeaverWritingRound("round")).toBe("JUDGING");
  });
  it("lets a solo player start judging immediately after submitting", async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValue([{ players: 1n, missing: 0n }]);
    expect(await advanceWordWeaverWritingRound("round")).toBe("JUDGING");
    expect(db.wordWeaverRound.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isSolo: true }) }));
  });
  it("closes an empty room instead of claiming everyone has submitted", async () => {
    db.$queryRaw.mockReset().mockResolvedValueOnce([]).mockResolvedValue([{ players: 0n, missing: 0n }]);
    expect(await advanceWordWeaverWritingRound("round")).toBe("CLOSED");
    expect(db.wordWeaverEntry.updateMany).not.toHaveBeenCalled();
    expect(db.wordWeaverRoom.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { currentRoundId: null } }));
  });
  it("waits for generating bots, but never beyond the writing deadline", async () => {
    db.wordWeaverBotTurn.count.mockResolvedValue(2);
    expect(await advanceWordWeaverWritingRound("round")).toBe("WAITING");
    db.wordWeaverRound.findUnique.mockResolvedValue({ status: "WRITING", writeDeadline: new Date(0) });
    expect(await advanceWordWeaverWritingRound("round")).toBe("JUDGING");
    expect(db.wordWeaverBotTurn.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED", leaseToken: null, leaseUntil: null } }));
  });
  it("does not restart judging when another worker already closed writing", async () => {
    db.wordWeaverRound.findUnique.mockResolvedValue({ status: "JUDGING" });
    expect(await advanceWordWeaverWritingRound("round")).toBeNull();
    expect(db.wordWeaverRound.update).not.toHaveBeenCalled();
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
