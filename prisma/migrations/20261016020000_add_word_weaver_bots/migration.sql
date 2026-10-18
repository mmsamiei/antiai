-- CreateEnum
CREATE TYPE "WordWeaverBotTurnStatus" AS ENUM ('PENDING', 'GENERATING', 'SUBMITTED', 'FAILED');

-- AlterTable
ALTER TABLE "WordWeaverRound" ADD COLUMN     "nextWordPickerUserId" TEXT;

-- AlterTable
ALTER TABLE "WordWeaverEntry" ADD COLUMN     "botPersonaId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WordWeaverBotTurn" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT '1',
    "status" "WordWeaverBotTurnStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),

    CONSTRAINT "WordWeaverBotTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WordWeaverBotTurn_roundId_status_leaseUntil_idx" ON "WordWeaverBotTurn"("roundId", "status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "WordWeaverBotTurn_roundId_personaId_key" ON "WordWeaverBotTurn"("roundId", "personaId");

-- CreateIndex
CREATE UNIQUE INDEX "WordWeaverEntry_roundId_botPersonaId_key" ON "WordWeaverEntry"("roundId", "botPersonaId");

-- AddForeignKey
ALTER TABLE "WordWeaverBotTurn" ADD CONSTRAINT "WordWeaverBotTurn_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "WordWeaverRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve next-word permissions on historical human-only results.
UPDATE "WordWeaverRound" SET "nextWordPickerUserId" = "winnerUserId" WHERE "winnerUserId" IS NOT NULL;

-- An entry belongs to exactly one human or one bot persona.
ALTER TABLE "WordWeaverEntry" ADD CONSTRAINT "WordWeaverEntry_exactly_one_author"
CHECK (("userId" IS NULL) <> ("botPersonaId" IS NULL));
