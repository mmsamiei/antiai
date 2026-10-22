CREATE TABLE "CountryRace" (
"id" TEXT NOT NULL PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'WAITING',
"playerOneId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
"playerTwoId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
"targetId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"startedAt" TIMESTAMP(3), "deadline" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "winnerUserId" TEXT, "endReason" TEXT,
"playerOneHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"playerTwoHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "CountryRace_playerOneId_status_idx" ON "CountryRace"("playerOneId","status");
CREATE INDEX "CountryRace_playerTwoId_status_idx" ON "CountryRace"("playerTwoId","status");
CREATE TABLE "CountryRaceGuess" (
"id" TEXT NOT NULL PRIMARY KEY, "raceId" TEXT NOT NULL REFERENCES "CountryRace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
"itemId" TEXT NOT NULL, "rank" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "CountryRaceGuess_raceId_userId_itemId_key" ON "CountryRaceGuess"("raceId","userId","itemId");
CREATE INDEX "CountryRaceGuess_raceId_userId_rank_idx" ON "CountryRaceGuess"("raceId","userId","rank");
ALTER TABLE "DuelInvite" ADD COLUMN "gameKind" TEXT NOT NULL DEFAULT 'LETTER_DUEL', ADD COLUMN "countryRaceId" TEXT;
CREATE UNIQUE INDEX "DuelInvite_countryRaceId_key" ON "DuelInvite"("countryRaceId");
ALTER TABLE "DuelInvite" ADD CONSTRAINT "DuelInvite_countryRaceId_fkey" FOREIGN KEY ("countryRaceId") REFERENCES "CountryRace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
