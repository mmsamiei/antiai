import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const id = currentUserId(); if (!id) return reply({ error: "ابتدا وارد شو" }, 401);
  return reply(await prisma.user.findUniqueOrThrow({ where: { id }, select: { showUsername: true, announcementsEnabled: true } }));
}
export async function PATCH(request: Request) {
  const id = currentUserId(); if (!id) return reply({ error: "ابتدا وارد شو" }, 401);
  const input = z.object({ showUsername: z.boolean().optional(), announcementsEnabled: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0).safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({ error: "تنظیم معتبر ارسال کن" }, 400);
  return reply(await prisma.user.update({ where: { id }, data: input.data, select: { showUsername: true, announcementsEnabled: true } }));
}
