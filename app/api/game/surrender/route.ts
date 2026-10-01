import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGame } from "@/lib/game-service";

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const { gameId } = await request.json().catch(() => ({}));
  const game = await prisma.gameSession.findFirst({ where: { id: gameId, userId, status: "ACTIVE" } });
  if (!game) return NextResponse.json({ error: "بازی فعال پیدا نشد" }, { status: 404 });
  const updated = await prisma.gameSession.update({
    where: { id: game.id }, data: { status: "SURRENDERED", finishedAt: new Date() },
    include: { guesses: { orderBy: { createdAt: "asc" } } }
  });
  return NextResponse.json({ game: serializeGame(updated, true) });
}
