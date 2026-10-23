import type { GameSession, PhraseHuntChallenge, Prisma } from "@prisma/client";

export type PhraseHuntGuessState = GameSession & {
  phraseChallenge: Pick<PhraseHuntChallenge, "judgeVersion" | "judgeModel"> | null;
  duplicate: boolean;
  recentCount: number;
};

/** One database snapshot for ownership, game state, duplicate and user-wide rate limit. */
export async function readPhraseHuntGuessState(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
  gameId: string,
  userId: string,
  normalized: string,
) {
  const rows = await client.$queryRaw<PhraseHuntGuessState[]>`
    SELECT s.*,
      CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object(
        'judgeVersion', c."judgeVersion", 'judgeModel', c."judgeModel"
      ) END AS "phraseChallenge",
      EXISTS (
        SELECT 1 FROM "PhraseHuntGuess" g
        WHERE g."gameId" = s.id AND g.normalized = ${normalized}
      ) AS duplicate,
      (
        SELECT COUNT(*)::integer FROM "PhraseHuntGuess" g
        JOIN "GameSession" recent ON recent.id = g."gameId"
        WHERE recent."userId" = ${userId}
          AND g."createdAt" >= ${new Date(Date.now() - 60_000)}
      ) AS "recentCount"
    FROM "GameSession" s
    LEFT JOIN "PhraseHuntChallenge" c ON c.id = s."phraseChallengeId"
    WHERE s.id = ${gameId} AND s."userId" = ${userId}
      AND s.type = 'PHRASE_HUNT' AND s.status = 'ACTIVE'
  `;
  return rows[0] ?? null;
}
