CREATE TABLE "AppPresence" (
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "context" TEXT NOT NULL DEFAULT 'MENU',
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppPresence_pkey" PRIMARY KEY ("userId", "clientId"),
  CONSTRAINT "AppPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AppPresence_lastSeenAt_context_idx" ON "AppPresence"("lastSeenAt", "context");

CREATE TABLE "CountryChallenge" (
  "id" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CountryChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CountryChallenge_startsAt_key" ON "CountryChallenge"("startsAt");
CREATE INDEX "CountryChallenge_startsAt_idx" ON "CountryChallenge"("startsAt");

CREATE TABLE "CountryChallengeEntry" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "guessCount" INTEGER NOT NULL DEFAULT 0,
  "bestRank" INTEGER,
  "bestRankAt" TIMESTAMP(3),
  "solvedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CountryChallengeEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CountryChallengeEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "CountryChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CountryChallengeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CountryChallengeEntry_challengeId_userId_key" ON "CountryChallengeEntry"("challengeId", "userId");
CREATE INDEX "CountryChallengeEntry_challengeId_status_guessCount_solvedAt_idx" ON "CountryChallengeEntry"("challengeId", "status", "guessCount", "solvedAt");
CREATE INDEX "CountryChallengeEntry_userId_createdAt_idx" ON "CountryChallengeEntry"("userId", "createdAt");

CREATE TABLE "CountryChallengeGuess" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CountryChallengeGuess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CountryChallengeGuess_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CountryChallengeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CountryChallengeGuess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CountryChallengeGuess_entryId_itemId_key" ON "CountryChallengeGuess"("entryId", "itemId");
CREATE INDEX "CountryChallengeGuess_entryId_rank_createdAt_idx" ON "CountryChallengeGuess"("entryId", "rank", "createdAt");

CREATE TABLE "CountryMatchSearch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "matchedRaceId" TEXT,
  CONSTRAINT "CountryMatchSearch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CountryMatchSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CountryMatchSearch_matchedRaceId_fkey" FOREIGN KEY ("matchedRaceId") REFERENCES "CountryRace"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CountryMatchSearch_matchedRaceId_key" ON "CountryMatchSearch"("matchedRaceId");
CREATE INDEX "CountryMatchSearch_status_createdAt_idx" ON "CountryMatchSearch"("status", "createdAt");
CREATE INDEX "CountryMatchSearch_userId_status_idx" ON "CountryMatchSearch"("userId", "status");
CREATE UNIQUE INDEX "CountryMatchSearch_one_active_per_user" ON "CountryMatchSearch"("userId") WHERE "status" = 'ACTIVE';

CREATE TABLE "CountryMatchOffer" (
  "id" TEXT NOT NULL,
  "searchId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "raceId" TEXT,
  CONSTRAINT "CountryMatchOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CountryMatchOffer_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "CountryMatchSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CountryMatchOffer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CountryMatchOffer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CountryMatchOffer_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "CountryRace"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CountryMatchOffer_raceId_key" ON "CountryMatchOffer"("raceId");
CREATE UNIQUE INDEX "CountryMatchOffer_searchId_recipientId_key" ON "CountryMatchOffer"("searchId", "recipientId");
CREATE INDEX "CountryMatchOffer_status_expiresAt_idx" ON "CountryMatchOffer"("status", "expiresAt");
CREATE INDEX "CountryMatchOffer_recipientId_status_createdAt_idx" ON "CountryMatchOffer"("recipientId", "status", "createdAt");
CREATE UNIQUE INDEX "CountryMatchOffer_one_pending_offer_per_recipient" ON "CountryMatchOffer"("recipientId") WHERE "status" = 'PENDING';

CREATE TABLE "CountryMatchState" (
  "userId" TEXT NOT NULL,
  "cooldownUntil" TIMESTAMP(3),
  "lastOfferedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CountryMatchState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "CountryMatchState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CountryMatchState_cooldownUntil_idx" ON "CountryMatchState"("cooldownUntil");
CREATE INDEX "CountryMatchState_lastOfferedAt_idx" ON "CountryMatchState"("lastOfferedAt");
