ALTER TABLE "PhraseHuntAnnouncement" ALTER COLUMN "challengeId" DROP NOT NULL;
ALTER TABLE "PhraseHuntAnnouncement" ADD COLUMN "geoChallengeId" TEXT;
CREATE UNIQUE INDEX "PhraseHuntAnnouncement_geoChallengeId_key" ON "PhraseHuntAnnouncement"("geoChallengeId");
ALTER TABLE "PhraseHuntAnnouncement" ADD CONSTRAINT "PhraseHuntAnnouncement_geoChallengeId_fkey" FOREIGN KEY ("geoChallengeId") REFERENCES "CountryChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "GeoChallengeNotificationConfig" (
 "gameType" TEXT PRIMARY KEY, "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastQueuedStart" TIMESTAMP(3)
);
