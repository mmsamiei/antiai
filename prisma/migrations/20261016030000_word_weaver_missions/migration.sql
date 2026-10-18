ALTER TABLE "WordWeaverRound"
    ADD COLUMN "missionId" TEXT,
    ADD COLUMN "missionType" TEXT,
    ADD COLUMN "nextMissionOptions" JSONB,
    ADD COLUMN "nextMissionId" TEXT;

ALTER TABLE "WordWeaverEntry"
    ADD COLUMN "feedback" TEXT;

-- Mark existing rounds as legacy free-writing rounds while preserving their text and results.
UPDATE "WordWeaverRound"
SET "missionType" = 'legacy_freewrite'
WHERE "missionType" IS NULL;
