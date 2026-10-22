ALTER TABLE "DuelInvite" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DIRECT';
CREATE TABLE "LetterDuelPracticeRound" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "letters" TEXT[] NOT NULL,
 "acceptedWord" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "LetterDuelPracticeRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LetterDuelPracticeRound_userId_key" ON "LetterDuelPracticeRound"("userId");
