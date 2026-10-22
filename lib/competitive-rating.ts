import { leaderboardCache, LIVE_BOARD_TTL } from "./leaderboard-cache";
import type { Prisma } from "@prisma/client";
import { eloResult } from "./elo";
import { prisma } from "./prisma";
import { publicDisplayName } from "./public-identity";

// Same transaction as match completion. Unique matchKey prevents double scoring.
export async function rateMatch(tx: Prisma.TransactionClient, matchKey: string, gameType: string, oneId: string, twoId: string, winner: string | null) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(87410221)`;
  if (await tx.competitiveResult.findUnique({ where: { matchKey } })) return;
  const ratings = [];
  for (const userId of [oneId, twoId]) ratings.push(await tx.competitiveRating.upsert({ where: { userId_gameType: { userId, gameType } }, create: { userId, gameType }, update: {} }));
  const score = winner === null ? 0.5 : winner === oneId ? 1 : 0;
  const next = eloResult(ratings[0].rating, ratings[1].rating, score);
  await tx.competitiveResult.create({ data: { matchKey, gameType, playerOneId: oneId, playerTwoId: twoId, winnerUserId: winner, oneBefore: ratings[0].rating, twoBefore: ratings[1].rating, oneAfter: next.one, twoAfter: next.two } });
  for (const [i, userId] of [oneId, twoId].entries()) await tx.competitiveRating.update({ where: { userId_gameType: { userId, gameType } }, data: { rating: i === 0 ? next.one : next.two, games: { increment: 1 }, wins: { increment: winner === userId ? 1 : 0 }, losses: { increment: winner !== null && winner !== userId ? 1 : 0 }, draws: { increment: winner === null ? 1 : 0 } } });
}

export async function competitiveLeaderboard(userId: string, gameType: string) {
  const ratings = await leaderboardCache.get(JSON.stringify(["competitive", gameType]), LIVE_BOARD_TTL, () => prisma.competitiveRating.findMany({ where: { gameType, games: { gt: 0 } }, orderBy: [{ rating: "desc" }, { userId: "asc" }] }));
  const selected = ratings.filter((r, i) => i < 50 || r.userId === userId);
  const users = await prisma.user.findMany({ where: { id: { in: selected.map(r => r.userId) } } });
  const rows = selected.map(r => { const user = users.find(u => u.id === r.userId); return { ...r, rank: ratings.indexOf(r) + 1, displayName: publicDisplayName(user, true), photoUrl: user?.photoUrl, averageGuesses: 0, bestGame: 0, isMe: r.userId === userId }; });
  return { rows: rows.filter(r => r.rank <= 50), me: rows.find(r => r.isMe) || null };
}

export function ownRatingChange(result: { playerOneId: string; oneBefore: number; twoBefore: number; oneAfter: number; twoAfter: number } | null, userId: string) {
  if (!result) return null;
  const before = result.playerOneId === userId ? result.oneBefore : result.twoBefore;
  const after = result.playerOneId === userId ? result.oneAfter : result.twoAfter;
  return { before, after, delta: after - before };
}
