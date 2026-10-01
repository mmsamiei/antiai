import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [user, total, wins, surrendered, aggregate, recent] = await prisma.$transaction([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.gameSession.count({ where: { userId } }),
    prisma.gameSession.count({ where: { userId, status: "WON" } }),
    prisma.gameSession.count({ where: { userId, status: "SURRENDERED" } }),
    prisma.gameSession.aggregate({ where: { userId, status: "WON" }, _avg: { guessesCount: true }, _min: { guessesCount: true } }),
    prisma.gameSession.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { finishedAt: "desc" }, take: 8 })
  ]);
  return NextResponse.json({
    user,
    stats: {
      total, wins, surrendered,
      averageGuesses: aggregate._avg.guessesCount ? Number(aggregate._avg.guessesCount.toFixed(1)) : 0,
      bestGame: aggregate._min.guessesCount || 0
    },
    recent: recent.map((game) => ({ id: game.id, type: game.type, status: game.status, guessesCount: game.guessesCount, finishedAt: game.finishedAt }))
  }, { headers: { "Cache-Control": "no-store" } });
}
