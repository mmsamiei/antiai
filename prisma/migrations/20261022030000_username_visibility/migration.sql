ALTER TABLE "User" ADD COLUMN "showUsername" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PhraseHuntAnnouncement" ADD COLUMN "winnerUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Preserve winner identity for announcements already queued before this feature.
WITH best AS (
 SELECT DISTINCT ON (g."phraseChallengeId", g."userId") g."phraseChallengeId", g."userId", pg.score, pg."createdAt", pg.id
 FROM "GameSession" g JOIN "PhraseHuntGuess" pg ON pg."gameId"=g.id
 JOIN "PhraseHuntAnnouncement" a ON a."challengeId"=g."phraseChallengeId" AND a.status='PENDING'
 ORDER BY g."phraseChallengeId",g."userId",pg.score DESC,pg."createdAt",pg.id
), ranked AS (
 SELECT *,row_number() OVER (PARTITION BY "phraseChallengeId" ORDER BY score DESC,"createdAt",id,"userId") AS position FROM best
), winners AS (
 SELECT "phraseChallengeId",array_agg("userId" ORDER BY position) AS ids FROM ranked WHERE position<=3 GROUP BY "phraseChallengeId"
)
UPDATE "PhraseHuntAnnouncement" a SET "winnerUserIds"=w.ids FROM winners w WHERE a."challengeId"=w."phraseChallengeId";
