ALTER TABLE "PhraseHuntChallenge"
  ALTER COLUMN "judgeModel" SET DEFAULT 'google/gemini-embedding-2';

ALTER TABLE "PhraseHuntJudgment"
  ALTER COLUMN "model" SET DEFAULT 'google/gemini-embedding-2';

-- Keep already-started/played challenges pinned to the judge they used. Only
-- migrate future, untouched challenge slots to the embedding judge.
UPDATE "PhraseHuntChallenge" AS challenge
SET "judgeVersion" = 4,
    "judgeModel" = 'google/gemini-embedding-2'
WHERE challenge."startsAt" > CURRENT_TIMESTAMP
  AND NOT EXISTS (
    SELECT 1
    FROM "GameSession" AS game
    WHERE game."phraseChallengeId" = challenge.id
  );
