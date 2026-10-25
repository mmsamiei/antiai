ALTER TABLE "User" ADD COLUMN "announcementsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ALTER COLUMN "announcementsEnabled" SET DEFAULT false;
