import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runPhraseHuntAnnouncementWorker } from "../lib/phrase-hunt-announcements";

const shutdown = new AbortController();
process.on("SIGTERM", () => shutdown.abort());
process.on("SIGINT", () => shutdown.abort());

void runPhraseHuntAnnouncementWorker(shutdown.signal)
  .catch((error) => {
    console.error("phrase-hunt announcement worker failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
