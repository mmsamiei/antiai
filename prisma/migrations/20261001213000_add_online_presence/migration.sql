CREATE TABLE "OnlinePresence" (
    "userId" TEXT NOT NULL,
    "isPlaying" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlinePresence_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "OnlinePresence_isPlaying_lastSeenAt_idx"
ON "OnlinePresence"("isPlaying", "lastSeenAt");

ALTER TABLE "OnlinePresence"
ADD CONSTRAINT "OnlinePresence_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
