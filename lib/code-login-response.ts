import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "./auth";
import { CodeLoginError } from "./code-login";
export const CODE_SESSION_COOKIE = "anti_ai_code_session";
export function codeReply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function codeFailure(error: unknown) {
  if (error instanceof CodeLoginError) return codeReply({ error: error.message }, error.status);
  console.error("code_login_failed", error instanceof Error ? error.name : "Unknown");
  return codeReply({ error: "ورود با کد موقتاً در دسترس نیست؛ دوباره تلاش کن." }, 503);
}
export function codeSessionReply(data: { session: string; expiresAt: number; user: unknown }) {
  const response = codeReply(data);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: process.env.NEXT_PUBLIC_BASE_PATH || "/", maxAge: Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000)) };
  response.cookies.set(SESSION_COOKIE, data.session, options);
  response.cookies.set(CODE_SESSION_COOKIE, data.session, options);
  return response;
}
