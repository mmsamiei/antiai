import { sessionUserId } from "./session-signature";
import crypto from "crypto";
import { isAccountSuspended } from "./account-suspensions";
import { cookies, headers } from "next/headers";

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

function userIdFromSession(value?: string): string | null {
  const userId = sessionUserId(value, sessionKey());
  return userId && !isAccountSuspended(userId) ? userId : null;
}

export function currentUserId(): string | null {
  // Telegram accounts can share browser cookies, but each app window has its
  // own signed token. An explicit token must never fall back to another account.
  const authorization = headers().get("authorization");
  if (authorization !== null) {
    if (!authorization.startsWith("Bearer ")) return null;
    return userIdFromSession(authorization.slice(7).trim());
  }
  return userIdFromSession(cookies().get(SESSION_COOKIE)?.value);
}
