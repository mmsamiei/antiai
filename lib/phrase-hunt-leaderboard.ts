import { leaderboardCache, LIVE_BOARD_TTL, challengeBoardTtl } from "./leaderboard-cache";
import { publicDisplayName } from "./public-identity";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { currentPhraseChallenge } from "./phrase-hunt-challenge";
import { phraseHuntTargets } from "./data/phrase-hunt-targets";

export async function phraseChallengeLeaderboard(userId: string, requestedId: string | null) {
  const now = new Date();
  const current = await currentPhraseChallenge(now);
  const challenges = await prisma.phraseHuntChallenge.findMany({
    where: { startsAt: { lte: now } }, orderBy: { startsAt: "desc" },
  });
  const selected = challenges.find(c => c.id === (requestedId || current.id));
  if (!selected) return null;
  const publicChallenge = (c: typeof selected) => ({
    id: c.id, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(),
    ended: c.endsAt <= now,
    ...(c.endsAt <= now ? { target: phraseHuntTargets.find(t => t.id === c.targetId)?.phrase } : {}),
  });
  const best = await leaderboardCache.get(JSON.stringify(["phrase-challenge", selected.id, +selected.endsAt, selected.endsAt <= now]), challengeBoardTtl(selected.endsAt, now), () => prisma.$queryRaw<{ userId: string; score: number; phrase: string; achievedAt: Date; guessCount: number }[]>(Prisma.sql`
    SELECT * FROM (
      SELECT DISTINCT ON (g."userId") g."userId", pg.score, pg.phrase,
        pg."createdAt" AS "achievedAt", COUNT(*) OVER (PARTITION BY g."userId")::int AS "guessCount"
      FROM "GameSession" g JOIN "PhraseHuntGuess" pg ON pg."gameId" = g.id
      WHERE g.type = 'PHRASE_HUNT' AND g."phraseChallengeId" = ${selected.id}
      ORDER BY g."userId", pg.score DESC, pg."createdAt" ASC, pg.id ASC
    ) best ORDER BY score DESC, "achievedAt" ASC, "userId" ASC
  `));
  const visibleIds = best.slice(0, 50).map(r => r.userId);
  if (best.some(r => r.userId === userId) && !visibleIds.includes(userId)) visibleIds.push(userId);
  const users = await prisma.user.findMany({ where: { id: { in: visibleIds } } });
  const userMap = new Map(users.map(u => [u.id, u]));
  const rows = best.map((r, i) => {
    const u = userMap.get(r.userId);
    return { rank: i + 1, userId: r.userId,
      displayName: publicDisplayName(u, true),
      photoUrl: u?.photoUrl, totalScore: r.score, guessCount: r.guessCount,
      achievedAt: r.achievedAt.toISOString(), isMe: r.userId === userId,
      wins: 0, averageGuesses: 0, bestGame: 0,
      ...(selected.endsAt <= now ? { bestGuess: r.phrase } : {}),
    };
  });
  return { rows: rows.slice(0, 50), me: rows.find(r => r.isMe) || null,
    period: "challenge", type: "PHRASE_HUNT", mode: "total", minimumWins: 0,
    challenges: challenges.map(publicChallenge), challenge: publicChallenge(selected), timeZone: "Asia/Tehran" };
}
