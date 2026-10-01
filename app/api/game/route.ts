import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { parseGameType, serializeGame } from "@/lib/game-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const type = parseGameType(new URL(request.url).searchParams.get("type"));
  if (!type) return NextResponse.json({ error: "نوع بازی معتبر نیست" }, { status: 400 });
  const game = await prisma.gameSession.findFirst({
    where: { userId, type, status: "ACTIVE" },
    include: { guesses: { orderBy: { createdAt: "asc" } } },
    orderBy: { startedAt: "desc" }
  });
  return NextResponse.json({ game: game ? serializeGame(game) : null }, { headers: { "Cache-Control": "no-store" } });
}
