import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cookie: vi.fn(), find: vi.fn(), suspended: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: mocks.cookie }), headers: () => new Headers() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.find } } }));
vi.mock("@/lib/account-suspensions", () => ({ isAccountSuspended: mocks.suspended }));
import { createCodeSession } from "@/lib/session-signature";
import { GET } from "./route";
let session: string, expiresAt: number;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "key"); vi.stubEnv("NODE_ENV", "production");
  ({ session, expiresAt } = createCodeSession("42", "key"));
  mocks.cookie.mockReturnValue({ value: session }); mocks.suspended.mockReturnValue(false);
  mocks.find.mockResolvedValue({ id: "42", firstName: "آزمایش", lastName: null, username: "test", photoUrl: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("resumes the same token with its original deadline and only remaining cookie lifetime", async () => {
  vi.advanceTimersByTime(3600_000);
  const response = await GET(new Request("https://test/api/auth/code/session"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ session, expiresAt });
  expect(response.headers.get("set-cookie")).toContain("Max-Age=39600");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects expired sessions without falling back to another account", async () => {
  vi.setSystemTime(expiresAt);
  expect((await GET(new Request("https://test/api/auth/code/session"))).status).toBe(401);
  expect(mocks.find).not.toHaveBeenCalled();
});
it("never falls back from an invalid explicit bearer to a valid cookie", async () => {
  expect((await GET(new Request("https://test/api/auth/code/session", { headers: { authorization: "Bearer forged" } }))).status).toBe(401);
  expect(mocks.find).not.toHaveBeenCalled();
});
it("honors account suspension", async () => {
  mocks.suspended.mockReturnValue(true);
  expect((await GET(new Request("https://test/api/auth/code/session"))).status).toBe(401);
  expect(mocks.find).not.toHaveBeenCalled();
});
