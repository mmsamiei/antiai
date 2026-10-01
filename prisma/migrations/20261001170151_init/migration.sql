-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('IRAN_CITY', 'COUNTRY');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ACTIVE', 'WON', 'SURRENDERED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GameType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'ACTIVE',
    "guessesCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guess" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameSession_userId_type_status_idx" ON "GameSession"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "GameSession_type_status_finishedAt_idx" ON "GameSession"("type", "status", "finishedAt");

-- CreateIndex
CREATE INDEX "GameSession_userId_targetId_idx" ON "GameSession"("userId", "targetId");

-- CreateIndex
CREATE INDEX "Guess_gameId_createdAt_idx" ON "Guess"("gameId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Guess_gameId_itemId_key" ON "Guess"("gameId", "itemId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guess" ADD CONSTRAINT "Guess_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
