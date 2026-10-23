import { prisma } from "./prisma";
import { normalizePersian } from "./geo";
import { selectPhraseHuntHistory } from "./phrase-hunt-history";
import { ResultCache } from "./result-cache";

const shared = globalThis as unknown as { phraseHuntGlobalHistoryCache?: ResultCache };
export const phraseHuntGlobalHistoryCache = shared.phraseHuntGlobalHistoryCache ??= new ResultCache(8, 1024 * 1024);

/** Read-only context preparation; never exposes user identifiers to the judge. */
export async function loadPhraseHuntHistory(challengeId: string, userId: string, currentGuess: string) {
  const normalized = normalizePersian(currentGuess);
  const results = await Promise.allSettled([
    phraseHuntGlobalHistoryCache.get(challengeId, 10_000, () => prisma.phraseHuntGuess.groupBy({
      by: ["normalized"], where: { game: { phraseChallengeId: challengeId } },
      // One spare row keeps a 200-word pool after excluding this request's guess.
      _max: { score: true }, orderBy: [{ _max: { score: "desc" } }, { normalized: "asc" }], take: 201,
    })).then(rows => rows.filter(row => row.normalized !== normalized).slice(0, 200)),
    prisma.phraseHuntGuess.groupBy({
      by: ["normalized"], where: { game: { phraseChallengeId: challengeId, userId }, normalized: { not: normalized } },
      _max: { score: true }, orderBy: [{ _max: { score: "desc" } }, { normalized: "asc" }], take: 100,
    }),
    // Sample distinct words in PostgreSQL rather than transferring and
    // normalizing the entire challenge's history for every new judgment.
    prisma.$queryRaw<{ normalized: string; score: number }[]>`
      SELECT g.normalized, MAX(g.score)::double precision AS score
      FROM "PhraseHuntGuess" g JOIN "GameSession" s ON s.id = g."gameId"
      WHERE s."phraseChallengeId" = ${challengeId} AND s."userId" <> ${userId}
        AND g.normalized <> ${normalized}
      GROUP BY g.normalized ORDER BY random() LIMIT 50
    `.then(rows => rows.map(row => ({ normalized: row.normalized, _max: { score: row.score } }))),
  ]);
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw failures[0].reason;
  const pools = results.map(result => {
    if (result.status !== "fulfilled") throw new Error("HISTORY_UNAVAILABLE");
    return result.value.flatMap(row => row._max.score === null ? [] : [{ phrase: row.normalized, score: row._max.score }]);
  });
  return selectPhraseHuntHistory({ global: pools[0], user: pools[1], others: pools[2] }, normalized);
}
