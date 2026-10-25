import crypto from "crypto";
export function sessionUserId(value: string | undefined, key: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  if (!/^[a-f0-9]{64}$/.test(value.slice(separator + 1))) return null;
  const userId = value.slice(0, separator);
  const actual = Buffer.from(value.slice(separator + 1), "hex");
  const expected = crypto.createHmac("sha256", key).update(userId).digest();
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  if (userId.startsWith("otp:")) {
    const parts = userId.split(":");
    if (parts.length !== 4 || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2]) || !/^[a-f0-9]{32}$/.test(parts[3])) return null;
    const expiresAt = Number(parts[2]);
    return Number.isSafeInteger(expiresAt) && expiresAt > Date.now() ? parts[1] : null;
  }
  return userId;
}

export const CODE_SESSION_MS = 12 * 60 * 60 * 1000;
export function createCodeSession(userId: string, key: string, now = Date.now()) {
  if (!/^\d+$/.test(userId) || !key) throw new Error("Invalid code session configuration");
  const expiresAt = now + CODE_SESSION_MS;
  const payload = `otp:${userId}:${expiresAt}:${crypto.randomBytes(16).toString("hex")}`;
  const signature = crypto.createHmac("sha256", key).update(payload).digest("hex");
  return { session: `${payload}.${signature}`, expiresAt };
}
