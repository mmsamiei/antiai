CREATE TYPE "PhraseHuntAnnouncementStatus" AS ENUM ('PENDING', 'COMPLETED');
CREATE TYPE "PhraseHuntAnnouncementDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "PhraseHuntNotificationConfig" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sendNotBefore" TIMESTAMP(3),
  CONSTRAINT "PhraseHuntNotificationConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PhraseHuntNotificationConfig" ("id", "enabledAt") VALUES ('global', CURRENT_TIMESTAMP);

CREATE TABLE "PhraseHuntAnnouncement" (
  "id" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "messageText" TEXT NOT NULL,
  "status" "PhraseHuntAnnouncementStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PhraseHuntAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhraseHuntAnnouncementDelivery" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "status" "PhraseHuntAnnouncementDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "PhraseHuntAnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhraseHuntAnnouncement_challengeId_key" ON "PhraseHuntAnnouncement"("challengeId");
CREATE UNIQUE INDEX "PhraseHuntAnnouncementDelivery_announcementId_chatId_key" ON "PhraseHuntAnnouncementDelivery"("announcementId", "chatId");
CREATE INDEX "PhraseHuntAnnouncementDelivery_status_nextAttemptAt_leaseUn_idx" ON "PhraseHuntAnnouncementDelivery"("status", "nextAttemptAt", "leaseUntil");

ALTER TABLE "PhraseHuntAnnouncement" ADD CONSTRAINT "PhraseHuntAnnouncement_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "PhraseHuntChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhraseHuntAnnouncementDelivery" ADD CONSTRAINT "PhraseHuntAnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "PhraseHuntAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
