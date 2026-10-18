ALTER TABLE "User" ADD COLUMN "phraseHuntOnboardedAt" TIMESTAMP(3);
CREATE TABLE "PhraseHuntChallenge" (
  "id" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "targetId" TEXT NOT NULL,
  "judgeVersion" INTEGER NOT NULL,
  CONSTRAINT "PhraseHuntChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhraseHuntChallenge_startsAt_key" ON "PhraseHuntChallenge"("startsAt");
ALTER TABLE "GameSession" ADD COLUMN "phraseChallengeId" TEXT;
CREATE UNIQUE INDEX "GameSession_userId_phraseChallengeId_key" ON "GameSession"("userId", "phraseChallengeId");
CREATE INDEX "GameSession_phraseChallengeId_idx" ON "GameSession"("phraseChallengeId");
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_phraseChallengeId_fkey" FOREIGN KEY ("phraseChallengeId") REFERENCES "PhraseHuntChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
