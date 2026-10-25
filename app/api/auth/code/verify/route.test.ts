import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/code-login", async original => ({ ...await original<typeof import("@/lib/code-login")>(), verifyLoginCode: mocks.verify }));
import { POST } from "./route";
const id = "a".repeat(32), secret = "b".repeat(64);
const request = (body: unknown) => new Request("https://test/anti-ai/api/auth/code/verify", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); });
it.each([null, {}, { id, secret, code: "12345" }, { id, secret, code: "123456", userId: "forged" }, { id, secret: "bad", code: "123456" }])("rejects malformed or forged requests %j", async body => {
  expect((await POST(request(body))).status).toBe(400); expect(mocks.verify).not.toHaveBeenCalled();
});
it("accepts Persian digits and issues a secure cookie with the fixed session deadline", async () => {
  const expiresAt = Date.now() + 12 * 3600_000;
  mocks.verify.mockResolvedValue({ user: { id: "42" }, session: "otp:session", expiresAt });
  const response = await POST(request({ id, secret, code: "۱۲۳۴۵۶" }));
  expect(response.status).toBe(200); expect(mocks.verify).toHaveBeenCalledWith(id, secret, "123456");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const cookie = response.headers.get("set-cookie") || "";
  expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=lax");
  expect(cookie).toMatch(/Max-Age=43(199|200)/);
});
