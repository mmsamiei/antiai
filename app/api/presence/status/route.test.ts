import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUserId: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("@/lib/prisma", () => ({ prisma: { onlinePresence: { findMany: mocks.findMany } } }));
import { POST } from "./route";

const request = (userIds: unknown) => new Request("https://example.test/api/presence/status", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds })
});

describe("POST /api/presence/status", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.currentUserId.mockReturnValue("viewer"); });

  it("requires authentication", async () => {
    mocks.currentUserId.mockReturnValue(null);
    expect((await POST(request(["player"]))).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("rejects oversized or malformed ID lists", async () => {
    expect((await POST(request(Array(101).fill("player")))).status).toBe(400);
    expect((await POST(request(["player", { id: "other" }]))).status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns only requested users seen in the last 20 seconds", async () => {
    mocks.findMany.mockResolvedValue([{ userId: "player" }]);
    const before = Date.now();
    const response = await POST(request(["player", "other", "player"]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ onlineUserIds: ["player"] });
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.userId.in).toEqual(["player", "other"]);
    expect(where.lastSeenAt.gte.getTime()).toBeGreaterThanOrEqual(before - 20_000);
    expect(where).not.toHaveProperty("isPlaying");
  });
});
