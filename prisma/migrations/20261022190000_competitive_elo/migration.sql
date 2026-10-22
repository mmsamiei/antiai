CREATE TABLE "CompetitiveRating" (
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "gameType" TEXT NOT NULL, "rating" INTEGER NOT NULL DEFAULT 1000,
 "games" INTEGER NOT NULL DEFAULT 0, "wins" INTEGER NOT NULL DEFAULT 0,
 "losses" INTEGER NOT NULL DEFAULT 0, "draws" INTEGER NOT NULL DEFAULT 0,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("userId", "gameType")
);
CREATE INDEX "CompetitiveRating_gameType_rating_idx" ON "CompetitiveRating"("gameType", "rating");
CREATE TABLE "CompetitiveResult" (
 "matchKey" TEXT PRIMARY KEY, "gameType" TEXT NOT NULL,
 "playerOneId" TEXT NOT NULL, "playerTwoId" TEXT NOT NULL, "winnerUserId" TEXT,
 "oneBefore" INTEGER NOT NULL, "twoBefore" INTEGER NOT NULL,
 "oneAfter" INTEGER NOT NULL, "twoAfter" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
