ALTER TYPE "GameType" ADD VALUE 'PHRASE_HUNT';

CREATE TABLE "PhraseHuntGuess" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhraseHuntGuess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhraseHuntGuess_gameId_normalized_key" ON "PhraseHuntGuess"("gameId", "normalized");
CREATE INDEX "PhraseHuntGuess_gameId_createdAt_idx" ON "PhraseHuntGuess"("gameId", "createdAt");
ALTER TABLE "PhraseHuntGuess" ADD CONSTRAINT "PhraseHuntGuess_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PhraseHuntJudgment" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "judgeVersion" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PhraseHuntJudgment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhraseHuntJudgment_targetId_phrase_judgeVersion_key" ON "PhraseHuntJudgment"("targetId", "phrase", "judgeVersion");
