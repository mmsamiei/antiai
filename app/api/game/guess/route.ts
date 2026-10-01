import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { currentUserId } from "@/lib/auth";
import { findItem, proximityRank } from "@/lib/geo";
import { prisma } from "@/lib/prisma";
import { serializeGame } from "@/lib/game-service";

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const { gameId, itemId } = await request.json().catch(() => ({}));
  if (typeof gameId !== "string" || typeof itemId !== "string") return NextResponse.json({ error: "حدس معتبر نیست" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.gameSession.findFirst({ where: { id: gameId, userId, status: "ACTIVE" } });
      if (!game) throw new Error("GAME_NOT_ACTIVE");
      const guessItem = findItem(game.type, itemId);
      const target = findItem(game.type, game.targetId);
      if (!guessItem || !target) throw new Error("ITEM_NOT_FOUND");
      const rank = proximityRank(game.type, guessItem, target);
      await tx.guess.create({ data: { gameId: game.id, itemId, rank } });
      const won = guessItem.id === target.id;
      const updated = await tx.gameSession.update({
        where: { id: game.id },
        data: { guessesCount: { increment: 1 }, ...(won ? { status: "WON", finishedAt: new Date() } : {}) },
        include: { guesses: { orderBy: { createdAt: "asc" } } }
      });
      return { game: updated, rank, won };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ game: serializeGame(result.game, result.won), rank: result.rank });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "این گزینه را قبلاً حدس زده‌ای" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "GAME_NOT_ACTIVE") return NextResponse.json({ error: "این بازی دیگر فعال نیست" }, { status: 409 });
    if (message === "ITEM_NOT_FOUND") return NextResponse.json({ error: "گزینه پیدا نشد" }, { status: 404 });
    return NextResponse.json({ error: "ثبت حدس انجام نشد" }, { status: 500 });
  }
}
