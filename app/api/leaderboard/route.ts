import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseGameType } from "@/lib/game-service";

export const dynamic = "force-dynamic";

function startOfWeekUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceSaturday = (day + 1) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceSaturday));
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
    userId: row.userId,
    wins: row._count._all,
    wonAverage: row._avg.guessesCount || 0,
    skillAverage: (completedGuessTotals.get(row.userId) || 0) / row._count._all,
    bestGame: row._min.guessesCount || 0
  }));
  const eligible = mode === "skill" ? ranked.filter((row) => row.wins >= 3) : ranked;
  const sorted = eligible.sort((a, b) => mode === "skill"
    ? a.skillAverage - b.skillAverage || b.wins - a.wins
    : b.wins - a.wins || a.wonAverage - b.wonAverage
  );
  const userIds = sorted.slice(0, 50).map((row) => row.userId);
  if (!userIds.includes(userId) && sorted.some((row) => row.userId === userId)) userIds.push(userId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((user) => [user.id, user]));
  const rows = sorted.map((row, index) => {
    const user = userMap.get(row.userId);
    return {
      rank: index + 1,
      userId: row.userId,
      displayName: user?.username ? `@${user.username}` : [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "بازیکن ناشناس",
      photoUrl: user?.photoUrl,
      wins: row.wins,
      averageGuesses: Number((mode === "skill" ? row.skillAverage : row.wonAverage).toFixed(1)),
      bestGame: row.bestGame,
      isMe: row.userId === userId
    };
  });
  const me = rows.find((row) => row.isMe) || null;
  return NextResponse.json({ rows: rows.slice(0, 50), me, period, mode, type: type || "ALL", minimumWins: mode === "skill" ? 3 : 0 }, { headers: { "Cache-Control": "no-store" } });
}
