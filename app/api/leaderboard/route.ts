import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseGameType } from "@/lib/game-service";
import { readSemantrisState } from "@/lib/semantris";

export const dynamic = "force-dynamic";

function startOfWeekUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceSaturday = (day + 1) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceSaturday));
}

function displayName(user: { id: string; username: string | null; firstName: string | null; lastName: string | null; photoUrl: string | null } | undefined) {
  return user?.username ? `@${user.username}` : [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "بازیکن ناشناس";
}

export async function GET(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const period = params.get("period") === "all" ? "all" : "week";
  const mode = params.get("mode") === "skill" ? "skill" : "effort";
  const requestedType = params.get("type");
  const type = requestedType === "ALL" || !requestedType ? null : parseGameType(requestedType);
  if (requestedType && requestedType !== "ALL" && !type) return NextResponse.json({ error: "Invalid game type" }, { status: 400 });
  const baseWhere = {
    ...(type ? { type } : {}),
    ...(period === "week" ? { finishedAt: { gte: startOfWeekUtc() } } : {})
  };

  if (type === "SEMANTRIS") {
    const games = await prisma.gameSession.findMany({
      where: { ...baseWhere, status: { not: "ACTIVE" } },
      select: { userId: true, semantrisState: true }
    });
    const totals = new Map<string, { games: number; totalScore: number; bestScore: number }>();
    for (const game of games) {
      const score = Math.max(0, readSemantrisState(game.semantrisState)?.score || 0);
      const current = totals.get(game.userId) || { games: 0, totalScore: 0, bestScore: 0 };
      current.games += 1; current.totalScore += score; current.bestScore = Math.max(current.bestScore, score);
      totals.set(game.userId, current);
    }
    const ranked = [...totals.entries()].map(([id, values]) => ({ userId: id, ...values }));
    ranked.sort((a, b) => mode === "effort"
      ? b.totalScore - a.totalScore || b.bestScore - a.bestScore || b.games - a.games
      : b.bestScore - a.bestScore || b.totalScore - a.totalScore || b.games - a.games
    );
    const userIds = ranked.slice(0, 50).map((row) => row.userId);
    if (!userIds.includes(userId) && ranked.some((row) => row.userId === userId)) userIds.push(userId);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    const userMap = new Map(users.map((user) => [user.id, user]));
    const rows = ranked.map((row, index) => {
      const user = userMap.get(row.userId);
      return { rank: index + 1, userId: row.userId, displayName: displayName(user), photoUrl: user?.photoUrl, wins: row.games, averageGuesses: mode === "effort" ? row.totalScore : row.bestScore, bestGame: row.bestScore, totalScore: row.totalScore, bestScore: row.bestScore, isMe: row.userId === userId };
    });
    const me = rows.find((row) => row.isMe) || null;
    return NextResponse.json({ rows: rows.slice(0, 50), me, period, mode, type, minimumWins: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const [wonGroups, completedGroups] = await Promise.all([
    prisma.gameSession.groupBy({
      by: ["userId"], where: { ...baseWhere, status: "WON" },
      _count: { _all: true }, _avg: { guessesCount: true }, _min: { guessesCount: true }
    }),
    prisma.gameSession.groupBy({
      by: ["userId"], where: { ...baseWhere, status: { not: "ACTIVE" } },
      _sum: { guessesCount: true }
    })
  ]);
  const completedGuessTotals = new Map(completedGroups.map((row) => [row.userId, row._sum.guessesCount || 0]));
  const ranked = wonGroups.map((row) => ({
    userId: row.userId, wins: row._count._all, wonAverage: row._avg.guessesCount || 0,
    skillAverage: (completedGuessTotals.get(row.userId) || 0) / row._count._all, bestGame: row._min.guessesCount || 0
  }));
  const eligible = mode === "skill" ? ranked.filter((row) => row.wins >= 3) : ranked;
  const sorted = eligible.sort((a, b) => mode === "skill" ? a.skillAverage - b.skillAverage || b.wins - a.wins : b.wins - a.wins || a.wonAverage - b.wonAverage);
  const userIds = sorted.slice(0, 50).map((row) => row.userId);
  if (!userIds.includes(userId) && sorted.some((row) => row.userId === userId)) userIds.push(userId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((user) => [user.id, user]));
  const rows = sorted.map((row, index) => {
    const user = userMap.get(row.userId);
    return { rank: index + 1, userId: row.userId, displayName: displayName(user), photoUrl: user?.photoUrl, wins: row.wins, averageGuesses: Number((mode === "skill" ? row.skillAverage : row.wonAverage).toFixed(1)), bestGame: row.bestGame, isMe: row.userId === userId };
  });
  const me = rows.find((row) => row.isMe) || null;
  return NextResponse.json({ rows: rows.slice(0, 50), me, period, mode, type: type || "ALL", minimumWins: mode === "skill" ? 3 : 0 }, { headers: { "Cache-Control": "no-store" } });
}
