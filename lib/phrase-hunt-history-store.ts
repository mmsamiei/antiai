import { prisma } from "./prisma";
import { normalizePersian } from "./geo";
import { selectPhraseHuntHistory } from "./phrase-hunt-history";

/** Read-only context preparation; never exposes user identifiers to the judge. */
export async function loadPhraseHuntHistory(challengeId: string, userId: string, currentGuess: string) {
  const normalized = normalizePersian(currentGuess);
  const results = await Promise.allSettled([
    prisma.phraseHuntGuess.groupBy({
      by: ["normalized"], where: { game: { phraseChallengeId: challengeId }, normalized: { not: normalized } },
      _max: { score: true }, orderBy: [{ _max: { score: "desc" } }, { normalized: "asc" }], take: 200,
    }),
    prisma.phraseHuntGuess.groupBy({
      by: ["normalized"], where: { game: { phraseChallengeId: challengeId, userId }, normalized: { not: normalized } },
      _max: { score: true }, orderBy: [{ _max: { score: "desc" } }, { normalized: "asc" }], take: 100,
    }),
    prisma.phraseHuntGuess.groupBy({
      by: ["normalized"], where: { game: { phraseChallengeId: challengeId, userId: { not: userId } }, normalized: { not: normalized } },
      _max: { score: true },
    }),
  ]);
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw failures[0].reason;
  const pools = results.map(result => {
    if (result.status !== "fulfilled") throw new Error("HISTORY_UNAVAILABLE");
    return result.value.flatMap(row => row._max.score === null ? [] : [{ phrase: row.normalized, score: row._max.score }]);
  });
  return selectPhraseHuntHistory({ global: pools[0], user: pools[1], others: pools[2] }, normalized);
}
