import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionValue, SESSION_COOKIE } from "@/lib/auth";
import { isAccountSuspended } from "@/lib/account-suspensions";
import { validateTelegramInitData } from "@/lib/telegram";

const input = z.object({ initData: z.string().min(1).max(16_384) });
const reply = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply("اطلاعات ورود ارسال‌شده معتبر نیست", "INVALID_REQUEST", 400);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("telegram_auth_configuration_missing");
    return reply("ورود به بازی موقتاً در دسترس نیست", "AUTH_UNAVAILABLE", 503);
  }
  let user;
  try {
    user = validateTelegramInitData(parsed.data.initData, botToken);
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new Error("Invalid user");
  } catch {
    console.warn("telegram_auth_invalid_session");
    return reply("اطلاعات ورود تلگرام معتبر نیست یا مهلت آن گذشته است؛ بازی را از داخل تلگرام دوباره باز کن", "INVALID_TELEGRAM_SESSION", 401);
  }
  try {
    if (isAccountSuspended(String(user.id))) return reply("دسترسی این حساب موقتاً تعلیق شده است", "ACCOUNT_SUSPENDED", 403);
    await prisma.user.upsert({
      where: { id: String(user.id) },
      create: { id: String(user.id), firstName: user.first_name, lastName: user.last_name, username: user.username, photoUrl: user.photo_url },
      update: { firstName: user.first_name, lastName: user.last_name, username: user.username, photoUrl: user.photo_url }
    });
    const session = createSessionValue(String(user.id));
    const response = NextResponse.json({ user, session });
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: process.env.NEXT_PUBLIC_BASE_PATH || "/", maxAge: 60 * 60 * 24 * 30
    });
    response.cookies.set("anti_ai_code_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: process.env.NEXT_PUBLIC_BASE_PATH || "/", maxAge: 0 });
    return response;
  } catch {
    console.error("telegram_auth_session_creation_failed");
    return reply("سرور بازی موقتاً نتوانست ورود را انجام دهد؛ دوباره تلاش کن", "AUTH_UNAVAILABLE", 503);
  }
}
