ALTER TABLE "PhraseHuntChallenge"
  ALTER COLUMN "judgeModel" SET DEFAULT 'typesafe/jev-1.13';

ALTER TABLE "PhraseHuntJudgment"
  ALTER COLUMN "model" SET DEFAULT 'typesafe/jev-1.13';

-- Keep started/current challenges pinned to the judge already used. Switch
-- only future, untouched challenge slots to the restored JEV judge.
UPDATE "PhraseHuntChallenge" AS challenge
SET "judgeVersion" = 5,
    "judgeModel" = 'typesafe/jev-1.13'
WHERE challenge."startsAt" > CURRENT_TIMESTAMP
  AND NOT EXISTS (
    SELECT 1
    FROM "GameSession" AS game
    WHERE game."phraseChallengeId" = challenge.id
  );
