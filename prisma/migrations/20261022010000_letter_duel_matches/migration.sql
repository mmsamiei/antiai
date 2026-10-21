ALTER TABLE "LetterDuelConnection"
ADD COLUMN "matchWinnerUserId" TEXT,
ADD COLUMN "endReason" TEXT,
ADD COLUMN "rematchOneAt" TIMESTAMP(3),
ADD COLUMN "rematchTwoAt" TIMESTAMP(3),
ADD COLUMN "rematchConnectionId" TEXT;
CREATE UNIQUE INDEX "LetterDuelConnection_rematchConnectionId_key" ON "LetterDuelConnection"("rematchConnectionId");
