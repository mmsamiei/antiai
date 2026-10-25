import crypto from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { CODE_SESSION_MS, createCodeSession, sessionUserId } from "./session-signature";
afterEach(() => vi.useRealTimers());
it("accepts a code session only until the exact 12-hour server deadline", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T00:00:00Z"));
  const { session, expiresAt } = createCodeSession("42", "secret");
  expect(expiresAt).toBe(Date.now() + CODE_SESSION_MS);
  expect(sessionUserId(session, "secret")).toBe("42");
  vi.setSystemTime(expiresAt - 1); expect(sessionUserId(session, "secret")).toBe("42");
  vi.setSystemTime(expiresAt); expect(sessionUserId(session, "secret")).toBeNull();
});
it("rejects forged signatures, altered expiry, truncated hex and other signing keys", () => {
  const { session } = createCodeSession("42", "secret");
  expect(sessionUserId(session, "other")).toBeNull();
  expect(sessionUserId(session.replace("otp:42:", "otp:43:"), "secret")).toBeNull();
  expect(sessionUserId(session + "garbage", "secret")).toBeNull();
  expect(sessionUserId(session.slice(0, -1), "secret")).toBeNull();
});
it("keeps ordinary Telegram session validation compatible", () => {
  const token = "42." + crypto.createHmac("sha256", "secret").update("42").digest("hex");
  expect(sessionUserId(token, "secret")).toBe("42");
});
