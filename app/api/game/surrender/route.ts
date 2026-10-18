import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRetiredWordGame, serializeGame } from "@/lib/game-service";

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const { gameId } = await request.json().catch(() => ({}));
  if (typeof gameId !== "string") return NextResponse.json({ error: "بازی معتبر نیست" }, { status: 400 });
  const game = await prisma.gameSession.findFirst({ where: { id: gameId, userId } });
  if (game && isRetiredWordGame(game.type)) return NextResponse.json({ error: "واژه‌جو دیگر در دسترس نیست" }, { status: 409 });
  if (!game || game.status !== "ACTIVE") return NextResponse.json({ error: "بازی فعال پیدا نشد" }, { status: 404 });
  if (game.type === "PHRASE_HUNT") return NextResponse.json({ error: "در معناجو امکان تسلیم وجود ندارد" }, { status: 409 });
  const changed = await prisma.gameSession.updateMany({ where: { id: game.id, userId, status: "ACTIVE" }, data: { status: "SURRENDERED", finishedAt: new Date() } });
  if (!changed.count) return NextResponse.json({ error: "بازی فعال پیدا نشد" }, { status: 409 });
  const updated = await prisma.gameSession.findUniqueOrThrow({
    where: { id: game.id }, include: { guesses: { orderBy: { createdAt: "asc" } }, phraseGuesses: { orderBy: { createdAt: "asc" } } }
  });
  return NextResponse.json({ game: serializeGame(updated, true) });
}
