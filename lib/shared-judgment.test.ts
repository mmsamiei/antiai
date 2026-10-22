import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ claim: vi.fn(), release: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { $queryRaw: m.claim, phraseHuntJudgmentLease: { deleteMany: m.release } } }));
import { sharedJudgment } from "./shared-judgment";
beforeEach(() => { vi.clearAllMocks(); m.claim.mockResolvedValue([{ key: "claimed" }]); m.release.mockResolvedValue({ count: 1 }); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("returns a cached zero score without reserving a lease", async () => {
  const work = vi.fn(); expect(await sharedJudgment(["key"], async () => 0, work)).toBe(0); expect(work).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
});
it("rechecks cache after acquisition and releases only its own lease", async () => {
  const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(42), work = vi.fn();
  expect(await sharedJudgment(["key"], read, work)).toBe(42); expect(work).not.toHaveBeenCalled();
  const owner = m.claim.mock.calls[0][2]; expect(m.release.mock.calls[0][0].where.owner).toBe(owner);
});
it("does not mask a provider error when cleanup also fails", async () => {
  m.release.mockRejectedValue(Error("cleanup"));
  await expect(sharedJudgment(["key"], async () => null, async () => { throw Error("provider failed"); })).rejects.toThrow("provider failed");
});
it("bounds the wait for another process and never runs duplicate work on timeout", async () => {
  vi.useFakeTimers(); vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValue(13000);
  m.claim.mockResolvedValue([]); const work = vi.fn();
  const assertion = expect(sharedJudgment(["key"], async () => null, work)).rejects.toThrow("JEV_BUSY");
  await vi.advanceTimersByTimeAsync(201); await assertion; expect(work).not.toHaveBeenCalled(); expect(m.release).not.toHaveBeenCalled();
});
