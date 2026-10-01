import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "anti_ai_user_id";

function sessionKey() {
  const key = process.env.TELEGRAM_BOT_TOKEN || (process.env.NODE_ENV !== "production" ? "anti-ai-local-development" : "");
  if (!key) throw new Error("Session signing key is missing");
  return key;
}

export function createSessionValue(userId: string): string {
  const signature = crypto.createHmac("sha256", sessionKey()).update(userId).digest("hex");
  return `${userId}.${signature}`;
}

export function currentUserId(): string | null {
  const value = cookies().get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const userId = value.slice(0, separator);
  const actual = Buffer.from(value.slice(separator + 1), "hex");
  const expected = Buffer.from(crypto.createHmac("sha256", sessionKey()).update(userId).digest("hex"), "hex");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return userId;
}
