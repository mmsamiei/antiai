ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'ADJECTIVE_RAIN';

CREATE TABLE "AdjectiveJudgment" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "word" TEXT NOT NULL,
  "accepted" BOOLEAN NOT NULL,
  "quality" INTEGER NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdjectiveJudgment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdjectiveJudgment_promptId_word_key" ON "AdjectiveJudgment"("promptId", "word");
