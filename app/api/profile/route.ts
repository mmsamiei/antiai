import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [user, totals, recent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.$queryRaw<{ total: number; wins: number; surrendered: number; average: number | null; best: number | null; duelWins: number; duelLosses: number; duelDraws: number }[]>`
      SELECT COUNT(*) FILTER (WHERE type <> 'LETTER_DUEL')::int AS total,
        COUNT(*) FILTER (WHERE type <> 'LETTER_DUEL' AND status = 'WON')::int AS wins,
        COUNT(*) FILTER (WHERE type <> 'LETTER_DUEL' AND status = 'SURRENDERED')::int AS surrendered,
        AVG("guessesCount") FILTER (WHERE type <> 'LETTER_DUEL' AND status = 'WON')::double precision AS average,
        MIN("guessesCount") FILTER (WHERE type <> 'LETTER_DUEL' AND status = 'WON')::int AS best,
        COUNT(*) FILTER (WHERE type = 'LETTER_DUEL' AND status = 'WON')::int AS "duelWins",
        COUNT(*) FILTER (WHERE type = 'LETTER_DUEL' AND status = 'LOST')::int AS "duelLosses",
        COUNT(*) FILTER (WHERE type = 'LETTER_DUEL' AND status = 'DRAW')::int AS "duelDraws"
      FROM "GameSession" WHERE "userId" = ${userId}
    `,
    prisma.gameSession.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { finishedAt: "desc" }, take: 8 }),
  ]);
  const { total, wins, surrendered, average, best, duelWins, duelLosses, duelDraws } = totals[0];
  return NextResponse.json({
    user,
    letterDuelStats: { total: duelWins + duelLosses + duelDraws, wins: duelWins, losses: duelLosses, draws: duelDraws },
    stats: {
      total, wins, surrendered,
      averageGuesses: average ? Number(average.toFixed(1)) : 0,
      bestGame: best || 0
    },
    recent: recent.map((game) => ({ id: game.id, type: game.type, status: game.status, guessesCount: game.guessesCount, finishedAt: game.finishedAt }))
  }, { headers: { "Cache-Control": "no-store" } });
}
