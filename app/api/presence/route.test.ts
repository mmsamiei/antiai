import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ owner: vi.fn(), transaction: vi.fn(), online: vi.fn(), app: vi.fn(), count: vi.fn(), waiting: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: m.owner }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: m.transaction, onlinePresence: { upsert: m.online, count: m.count }, appPresence: { upsert: m.app }, letterDuelConnection: { findFirst: m.waiting } } }));
import { onlineCountCache } from "@/lib/online-count-cache";
import { POST } from "./route";
const request = () => new Request("http://test/api/presence", { method: "POST", body: JSON.stringify({ clientId: "test-client-123", context: "GAME" }) });
beforeEach(() => { vi.clearAllMocks(); onlineCountCache.clear(); m.owner.mockReturnValue("one"); m.transaction.mockResolvedValue([]); m.count.mockResolvedValue(10); m.waiting.mockResolvedValue(null); });
it("authenticates before accessing cached data", async () => {
  m.owner.mockReturnValue(null); expect((await POST(request())).status).toBe(401); expect(m.transaction).not.toHaveBeenCalled(); expect(m.count).not.toHaveBeenCalled();
});
it("shares only the count and still writes every heartbeat and checks each player's waiting rooms", async () => {
  m.waiting.mockResolvedValueOnce({ id: "room" });
  expect(await (await POST(request())).json()).toEqual({ onlineCount: 10, randomDuelWaiting: true });
  m.owner.mockReturnValue("two");
  expect(await (await POST(request())).json()).toEqual({ onlineCount: 10, randomDuelWaiting: false });
  expect(m.count).toHaveBeenCalledTimes(1); expect(m.online).toHaveBeenCalledTimes(2); expect(m.app).toHaveBeenCalledTimes(2); expect(m.transaction).toHaveBeenCalledTimes(2); expect(m.waiting).toHaveBeenCalledTimes(2);
  expect(m.online.mock.calls[1][0].where).toEqual({ userId: "two" });
});
