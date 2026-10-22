ALTER TABLE "CountryChallenge" ADD COLUMN "gameType" "GameType" NOT NULL DEFAULT 'COUNTRY';
DROP INDEX "CountryChallenge_startsAt_key";
CREATE UNIQUE INDEX "CountryChallenge_gameType_startsAt_key" ON "CountryChallenge"("gameType", "startsAt");
ALTER TABLE "CountryMatchSearch" ADD COLUMN "gameType" "GameType" NOT NULL DEFAULT 'COUNTRY';
CREATE INDEX "CountryMatchSearch_gameType_status_createdAt_idx" ON "CountryMatchSearch"("gameType", "status", "createdAt");
