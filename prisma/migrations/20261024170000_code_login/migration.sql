CREATE TABLE "CodeLoginRequest" (
  "id" TEXT NOT NULL,
  "browserHash" TEXT NOT NULL,
  "addressHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT,
  "codeHash" TEXT,
  "codeExpiresAt" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "CodeLoginRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CodeLoginRequest_addressHash_createdAt_idx" ON "CodeLoginRequest"("addressHash", "createdAt");
CREATE INDEX "CodeLoginRequest_userId_issuedAt_idx" ON "CodeLoginRequest"("userId", "issuedAt");
CREATE INDEX "CodeLoginRequest_expiresAt_idx" ON "CodeLoginRequest"("expiresAt");
