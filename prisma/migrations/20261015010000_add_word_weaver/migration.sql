CREATE TYPE "WordWeaverRoundStatus" AS ENUM ('WRITING', 'JUDGING', 'RESULTS', 'CLOSED');
CREATE TYPE "WordWeaverEntryStatus" AS ENUM ('PENDING', 'SCORED', 'FAILED');

CREATE TABLE "WordWeaverRoom" (
    "id" TEXT NOT NULL DEFAULT 'public',
    "currentRoundId" TEXT,
    "workerLeaseOwner" TEXT,
    "workerLeaseUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WordWeaverRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WordWeaverPresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WordWeaverPresence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WordWeaverRound" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "WordWeaverRoundStatus" NOT NULL DEFAULT 'WRITING',
    "word" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "writeDeadline" TIMESTAMP(3) NOT NULL,
    "judgeStartedAt" TIMESTAMP(3),
    "revealUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "isSolo" BOOLEAN NOT NULL DEFAULT false,
    "winnerUserId" TEXT,
    "winningEntryId" TEXT,
    "nextWord" TEXT,
    "judgeModel" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    CONSTRAINT "WordWeaverRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WordWeaverEntry" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "WordWeaverEntryStatus" NOT NULL DEFAULT 'PENDING',
    "relevanceScore" DOUBLE PRECISION,
    "originalityScore" DOUBLE PRECISION,
    "expressionScore" DOUBLE PRECISION,
    "finalScore" INTEGER,
    "failureMessage" TEXT,
    "judgeAttempts" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "judgedAt" TIMESTAMP(3),
    CONSTRAINT "WordWeaverEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WordWeaverRound_number_key" ON "WordWeaverRound"("number");
CREATE INDEX "WordWeaverRound_status_writeDeadline_idx" ON "WordWeaverRound"("status", "writeDeadline");
CREATE INDEX "WordWeaverRound_status_revealUntil_idx" ON "WordWeaverRound"("status", "revealUntil");
CREATE UNIQUE INDEX "WordWeaverEntry_roundId_userId_key" ON "WordWeaverEntry"("roundId", "userId");
CREATE INDEX "WordWeaverEntry_roundId_status_idx" ON "WordWeaverEntry"("roundId", "status");
CREATE INDEX "WordWeaverEntry_roundId_finalScore_idx" ON "WordWeaverEntry"("roundId", "finalScore" DESC);
CREATE UNIQUE INDEX "WordWeaverPresence_userId_clientId_key" ON "WordWeaverPresence"("userId", "clientId");
CREATE INDEX "WordWeaverPresence_lastSeenAt_idx" ON "WordWeaverPresence"("lastSeenAt");
CREATE INDEX "WordWeaverPresence_userId_lastSeenAt_idx" ON "WordWeaverPresence"("userId", "lastSeenAt");

ALTER TABLE "WordWeaverPresence" ADD CONSTRAINT "WordWeaverPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WordWeaverEntry" ADD CONSTRAINT "WordWeaverEntry_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "WordWeaverRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WordWeaverEntry" ADD CONSTRAINT "WordWeaverEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
