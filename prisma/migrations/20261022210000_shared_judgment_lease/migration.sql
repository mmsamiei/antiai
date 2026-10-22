CREATE TABLE "PhraseHuntJudgmentLease" (
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PhraseHuntJudgmentLease_pkey" PRIMARY KEY ("key")
);
