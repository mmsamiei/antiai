import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 50_000;

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const isPlaying = body?.isPlaying === true;
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);

  const [, onlineCount] = await prisma.$transaction([
    prisma.onlinePresence.upsert({
      where: { userId },
      create: { userId, isPlaying, lastSeenAt: now },
      update: { isPlaying, lastSeenAt: now }
    }),
    prisma.onlinePresence.count({
      where: { isPlaying: true, lastSeenAt: { gte: onlineSince } }
    })
  ]);

  return NextResponse.json({ onlineCount }, { headers: { "Cache-Control": "no-store" } });
}
