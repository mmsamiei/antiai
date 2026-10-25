ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'ANIMAL';

ALTER TABLE "CountryRace"
  ADD COLUMN "selectionDeadline" TIMESTAMP(3),
  ADD COLUMN "playerOneTargetId" TEXT,
  ADD COLUMN "playerTwoTargetId" TEXT;
