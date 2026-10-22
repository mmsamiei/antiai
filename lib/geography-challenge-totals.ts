import { prisma } from "./prisma";
import { phraseWeekStart } from "./phrase-hunt-schedule";
import { publicDisplayName } from "./public-identity";
import type { GeoRaceType } from "./geo-race-config";

export function challengeTotals(entries: { userId: string; status: string; guessCount: number; bestRank: number | null }[]) {
  const totals = new Map<string, { userId: string; wins: number; games: number; solvedGuesses: number; ranks: number }>();
  for (const entry of entries) {
    const row = totals.get(entry.userId) || { userId: entry.userId, wins: 0, games: 0, solvedGuesses: 0, ranks: 0 };
    row.games++; row.ranks += entry.bestRank ?? 1000000;
    if (entry.status === "WON") { row.wins++; row.solvedGuesses += entry.guessCount; }
    totals.set(entry.userId, row);
  }
  return [...totals.values()].sort((a, b) => b.wins - a.wins || (a.wins && b.wins ? a.solvedGuesses / a.wins - b.solvedGuesses / b.wins : 0) || a.ranks / a.games - b.ranks / b.games || a.userId.localeCompare(b.userId));
}
export async function geographyChallengeTotals(userId: string, gameType: GeoRaceType, period: "week" | "all") {
  const entries = await prisma.countryChallengeEntry.findMany({ where: { challenge: { gameType, ...(period === "week" ? { startsAt: { gte: phraseWeekStart() } } : {}) }, guessCount: { gt: 0 } }, select: { userId: true, status: true, guessCount: true, bestRank: true } });
  const totals = challengeTotals(entries);
  const selected = totals.filter((r, i) => i < 50 || r.userId === userId);
  const users = await prisma.user.findMany({ where: { id: { in: selected.map(r => r.userId) } } });
  const rows = selected.map(r => { const user = users.find(u => u.id === r.userId); return { userId: r.userId, rank: totals.indexOf(r) + 1, wins: r.wins, games: r.games, averageGuesses: r.wins ? Number((r.solvedGuesses / r.wins).toFixed(1)) : 0, bestGame: 0, challengeTotal: true, displayName: publicDisplayName(user, true), photoUrl: user?.photoUrl, isMe: r.userId === userId }; });
  return { rows: rows.filter(r => r.rank <= 50), me: rows.find(r => r.isMe) || null };
}
