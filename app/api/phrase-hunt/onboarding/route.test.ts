import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { updateMany: mocks.update } } }));
import { POST } from "./route";
beforeEach(() => { vi.clearAllMocks(); });
it("requires a signed-in user", async () => {
  mocks.user.mockReturnValue(null);
  expect((await POST()).status).toBe(401);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("acknowledges onboarding only for the authenticated account and only once", async () => {
  mocks.user.mockReturnValue("owner");
  mocks.update.mockResolvedValue({ count: 1 });
  expect((await POST()).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "owner", phraseHuntOnboardedAt: null }, data: { phraseHuntOnboardedAt: expect.any(Date) } });
  mocks.update.mockResolvedValue({ count: 0 });
  expect((await POST()).status).toBe(200);
});
