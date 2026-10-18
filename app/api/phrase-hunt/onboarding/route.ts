import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  await prisma.user.updateMany({ where: { id: userId, phraseHuntOnboardedAt: null }, data: { phraseHuntOnboardedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
