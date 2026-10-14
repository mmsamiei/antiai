import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionValue, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await prisma.user.upsert({
    where: { id: "local-demo" },
    create: { id: "local-demo", firstName: "بازیکن", username: "local_demo" },
    update: {}
  });
  const session = createSessionValue(user.id);
  const response = NextResponse.json({ user: { id: user.id, first_name: user.firstName, username: user.username }, session });
  response.cookies.set(SESSION_COOKIE, session, { httpOnly: true, sameSite: "lax", path: process.env.NEXT_PUBLIC_BASE_PATH || "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
