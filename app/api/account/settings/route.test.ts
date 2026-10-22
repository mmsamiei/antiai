import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ userId: vi.fn(), update: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.userId }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { update: mocks.update, findUniqueOrThrow: mocks.find } } }));
import { GET, PATCH } from "./route";
const request = (body: unknown) => new Request("https://test/api/account/settings", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.userId.mockReturnValue("owner"); mocks.update.mockResolvedValue({ showUsername: false }); });
describe("account privacy settings", () => {
  it("requires authentication", async () => {
    mocks.userId.mockReturnValue(null);
    expect((await GET()).status).toBe(401); expect((await PATCH(request({ showUsername: false }))).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([null, {}, { showUsername: "false" }, { showUsername: false, userId: "other" }])("rejects invalid or foreign account updates %j", async body => {
    expect((await PATCH(request(body))).status).toBe(400); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("updates only the signed-in user and persists an explicit opt-out", async () => {
    expect((await PATCH(request({ showUsername: false }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "owner" }, data: { showUsername: false }, select: { showUsername: true } });
  });
});
