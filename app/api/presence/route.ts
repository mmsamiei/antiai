import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 20_000;
const DUEL_WAITING_WINDOW_MS = 30_000;

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(body.clientId) ? body.clientId : null;
  const context = body?.context === "GAME" ? "GAME" : "MENU";
  if (!clientId) return NextResponse.json({ error: "شناسهٔ حضور معتبر نیست" }, { status: 400 });
  const isPlaying = context === "GAME";
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);

  const [, , onlineCount] = await prisma.$transaction([
    prisma.onlinePresence.upsert({
      where: { userId },
      create: { userId, isPlaying, lastSeenAt: now },
      update: { isPlaying, lastSeenAt: now }
    }),
    prisma.appPresence.upsert({
      where: { userId_clientId: { userId, clientId } },
      create: { userId, clientId, context, lastSeenAt: now },
      update: { context, lastSeenAt: now },
    }),
    prisma.onlinePresence.count({
      where: { lastSeenAt: { gte: onlineSince } }
    })
  ]);

  const randomDuelWaiting = Boolean(await prisma.letterDuelConnection.findFirst({
    where: {
      mode: "RANDOM", status: "WAITING", playerTwoId: null,
      playerOneId: { not: userId },
      playerOneHeartbeat: { gte: new Date(now.getTime() - DUEL_WAITING_WINDOW_MS) }
    },
    select: { id: true }
  }));
  return NextResponse.json({ onlineCount, randomDuelWaiting }, { headers: { "Cache-Control": "no-store" } });
}
