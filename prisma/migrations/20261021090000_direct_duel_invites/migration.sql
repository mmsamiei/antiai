ALTER TABLE "User" ADD COLUMN "acceptsGameInvites" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "DuelInvite" (
 "id" TEXT PRIMARY KEY, "senderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "respondedAt" TIMESTAMP(3), "startDeadline" TIMESTAMP(3),
 "senderReadyAt" TIMESTAMP(3), "recipientReadyAt" TIMESTAMP(3),
 "connectionId" TEXT REFERENCES "LetterDuelConnection"("id"),
 CONSTRAINT "DuelInvite_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED')),
 CONSTRAINT "DuelInvite_distinct_players" CHECK ("senderId" <> "recipientId")
);
CREATE UNIQUE INDEX "DuelInvite_connectionId_key" ON "DuelInvite"("connectionId");
CREATE INDEX "DuelInvite_senderId_status_createdAt_idx" ON "DuelInvite"("senderId", "status", "createdAt");
CREATE INDEX "DuelInvite_recipientId_status_createdAt_idx" ON "DuelInvite"("recipientId", "status", "createdAt");
CREATE INDEX "DuelInvite_status_expiresAt_idx" ON "DuelInvite"("status", "expiresAt");
CREATE UNIQUE INDEX "DuelInvite_one_pending_sender" ON "DuelInvite"("senderId") WHERE "status" = 'PENDING';

CREATE INDEX "OnlinePresence_lastSeenAt_idx" ON "OnlinePresence"("lastSeenAt");
