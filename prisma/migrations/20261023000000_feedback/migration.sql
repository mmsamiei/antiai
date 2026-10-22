CREATE TYPE "FeedbackKind" AS ENUM ('SUGGESTION', 'CRITICISM', 'BUG', 'FEATURE');
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'REVIEWED', 'ACCEPTED', 'IMPLEMENTED');
CREATE TABLE "Feedback" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "kind" "FeedbackKind" NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL,
 "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING', "reply" TEXT, "approvedAt" TIMESTAMP(3),
 "reviewedAt" TIMESTAMP(3), "reviewedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Feedback_userId_requestId_key" ON "Feedback"("userId", "requestId");
CREATE UNIQUE INDEX "Feedback_userId_fingerprint_key" ON "Feedback"("userId", "fingerprint");
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
