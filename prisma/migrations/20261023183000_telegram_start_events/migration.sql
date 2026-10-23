CREATE TABLE "TelegramStartEvent" (
    "updateId" BIGINT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "payloadKind" TEXT NOT NULL,
    "messageAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramStartEvent_pkey" PRIMARY KEY ("updateId")
);

CREATE INDEX "TelegramStartEvent_messageAt_idx" ON "TelegramStartEvent"("messageAt");
CREATE INDEX "TelegramStartEvent_telegramUserId_messageAt_idx" ON "TelegramStartEvent"("telegramUserId", "messageAt");
