import { geographyChallengeTotals } from "@/lib/geography-challenge-totals";
import { competitiveLeaderboard } from "@/lib/competitive-rating";
import { publicDisplayName } from "@/lib/public-identity";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseLeaderboardGameType } from "@/lib/game-service";
import { phraseWeekStart } from "@/lib/phrase-hunt-schedule";
import { phraseChallengeLeaderboard } from "@/lib/phrase-hunt-leaderboard";
import { readSemantrisState } from "@/lib/semantris";
import { countryChallengeLeaderboard } from "@/lib/country-challenge";

export const dynamic = "force-dynamic";

function startOfWeekUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceSaturday = (day + 1) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceSaturday));
}

function displayName(user: { id: string; username: string | null; firstName: string | null; lastName: string | null; photoUrl: string | null; showUsername?: boolean } | undefined) {
  return publicDisplayName(user, true);
}

export async function GET(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const requestedPeriod = params.get("period");
  const period = requestedPeriod === "all" ? "all" : requestedPeriod === "challenge" ? "challenge" : "week";
  const mode = params.get("mode") === "skill" ? "skill" : "effort";
  const requestedType = params.get("type");
  const type = requestedType === "ALL" || !requestedType ? null : parseLeaderboardGameType(requestedType);
  if (requestedType && requestedType !== "ALL" && !type) return NextResponse.json({ error: "Invalid game type" }, { status: 400 });
  if (params.get("board") === "competitive") {
    if (type !== "COUNTRY" && type !== "IRAN_CITY" && type !== "LETTER_DUEL") return NextResponse.json({ error: "Invalid competitive game" }, { status: 400 });
    return NextResponse.json(await competitiveLeaderboard(userId, type), { headers: { "Cache-Control": "no-store" } });
  }
  if (params.get("board") === "challenge" && period !== "challenge" && (type === "COUNTRY" || type === "IRAN_CITY")) {
    return NextResponse.json(await geographyChallengeTotals(userId, type, period), { headers: { "Cache-Control": "no-store" } });
  }
  const baseWhere = {
    ...(type ? { type } : {}),
    ...(period === "week" ? { finishedAt: { gte: startOfWeekUtc() } } : {})
  };

  if (type === "PHRASE_HUNT" && params.get("period") === "challenge") {
    const result = await phraseChallengeLeaderboard(userId, params.get("challengeId"));
    return NextResponse.json(result || { error: "Challenge not found" }, {
      status: result ? 200 : 404, headers: { "Cache-Control": "no-store" },
    });
  }

  if ((type === "COUNTRY" || type === "IRAN_CITY") && period === "challenge") {
    const result = await countryChallengeLeaderboard(userId, params.get("challengeId"), type);
    return NextResponse.json(result || { error: "Challenge not found" }, {
      status: result ? 200 : 404, headers: { "Cache-Control": "no-store" },
    });
  }

  if (type === "PHRASE_HUNT") {
    const totals = await prisma.$queryRaw<{ userId: string; totalScore: number; games: number }[]>(Prisma.sql`
      SELECT g."userId", SUM(ROUND(best.score::numeric, 2))::double precision AS "totalScore", COUNT(*)::int AS games
      FROM "GameSession" g
      JOIN "PhraseHuntChallenge" c ON c.id = g."phraseChallengeId"
      JOIN (SELECT "gameId", MAX(score) AS score FROM "PhraseHuntGuess" GROUP BY "gameId") best ON best."gameId" = g.id
      WHERE g.type = 'PHRASE_HUNT'
        ${period === "week" ? Prisma.sql`AND c."startsAt" >= ${phraseWeekStart()}` : Prisma.empty}
      GROUP BY g."userId"
      ORDER BY SUM(ROUND(best.score::numeric, 2)) DESC, g."userId" ASC
    `);
    const topIds = totals.slice(0, 50).map(row => row.userId);
    if (!topIds.includes(userId) && totals.some(row => row.userId === userId)) topIds.push(userId);
    const users = await prisma.user.findMany({ where: { id: { in: topIds } } });
    const userMap = new Map(users.map(user => [user.id, user]));
    const rows = totals.map((row, index) => ({
      rank: index + 1, userId: row.userId, displayName: displayName(userMap.get(row.userId)),
      photoUrl: userMap.get(row.userId)?.photoUrl, games: row.games, totalScore: Number(row.totalScore.toFixed(2)),
      wins: 0, averageGuesses: 0, bestGame: 0, isMe: row.userId === userId,
    }));
    return NextResponse.json({ rows: rows.slice(0, 50), me: rows.find(row => row.isMe) || null,
      period, mode: "total", type, minimumWins: 0, timeZone: "Asia/Tehran" }, { headers: { "Cache-Control": "no-store" } });
  }

  if (type === "LETTER_DUEL") {
    const groups = await prisma.gameSession.groupBy({
      by: ["userId", "status"],
      orderBy: [{ userId: "asc" }, { status: "asc" }],
      where: { ...baseWhere, status: { in: ["WON", "LOST", "DRAW"] } },
      _count: { _all: true }
    });
    const totals = new Map<string, { wins: number; losses: number; draws: number }>();
    for (const group of groups) {
      const current = totals.get(group.userId) || { wins: 0, losses: 0, draws: 0 };
      if (group.status === "WON") current.wins += group._count?._all || 0;
      if (group.status === "LOST") current.losses += group._count?._all || 0;
      if (group.status === "DRAW") current.draws += group._count?._all || 0;
      totals.set(group.userId, current);
    }
    const ranked = [...totals].map(([userId, value]) => { const rounds = value.wins + value.losses + value.draws; return { userId, ...value, rounds, winRate: rounds ? value.wins / rounds : 0 }; });
    const eligible = mode === "skill" ? ranked.filter((row) => row.rounds >= 10) : ranked;
    eligible.sort((a, b) => mode === "effort" ? b.rounds - a.rounds || b.wins - a.wins || b.winRate - a.winRate : b.winRate - a.winRate || b.rounds - a.rounds || b.wins - a.wins);
    const userIds = eligible.slice(0, 50).map((row) => row.userId); if (!userIds.includes(userId) && eligible.some((row) => row.userId === userId)) userIds.push(userId);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } }); const userMap = new Map(users.map((user) => [user.id, user]));
    const rows = eligible.map((row, index) => { const user = userMap.get(row.userId); return { rank: index + 1, ...row, displayName: displayName(user), photoUrl: user?.photoUrl, averageGuesses: Number((row.winRate * 100).toFixed(1)), bestGame: row.rounds, isMe: row.userId === userId }; });
    return NextResponse.json({ rows: rows.slice(0, 50), me: rows.find((row) => row.isMe) || null, period, mode, type, minimumWins: mode === "skill" ? 10 : 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  if (type === "SEMANTRIS") {
    const weekStart = startOfWeekUtc();
    const semantrisWhere: Prisma.GameSessionWhereInput = period === "week"
      ? { type: "SEMANTRIS", OR: [
          { status: "ACTIVE", startedAt: { gte: weekStart } },
          { status: { in: ["WON", "SURRENDERED"] }, finishedAt: { gte: weekStart } }
        ] }
      : { type: "SEMANTRIS" as const };
    const games = await prisma.gameSession.findMany({
      where: { ...semantrisWhere, status: { in: ["ACTIVE", "WON", "SURRENDERED"] } },
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
    userId: row.userId, wins: row._count?._all || 0, wonAverage: row._avg.guessesCount || 0,
    skillAverage: (completedGuessTotals.get(row.userId) || 0) / row._count?._all || 0, bestGame: row._min.guessesCount || 0
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
