import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionValue, SESSION_COOKIE } from "@/lib/auth";
import { validateTelegramInitData } from "@/lib/telegram";

export async function POST(request: Request) {
  try {
    const { initData } = await request.json();
    const user = validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN || "");
    await prisma.user.upsert({
      where: { id: String(user.id) },
      create: { id: String(user.id), firstName: user.first_name, lastName: user.last_name, username: user.username, photoUrl: user.photo_url },
      update: { firstName: user.first_name, lastName: user.last_name, username: user.username, photoUrl: user.photo_url }
    });
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, createSessionValue(String(user.id)), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30
    });
    return response;
  } catch {
    return NextResponse.json({ error: "ورود تلگرام معتبر نیست" }, { status: 401 });
  }
}
