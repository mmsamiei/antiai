import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runWordWeaverWorker } from "../lib/word-weaver-worker";

const shutdown = new AbortController();
process.on("SIGTERM", () => shutdown.abort());
process.on("SIGINT", () => shutdown.abort());
void runWordWeaverWorker(shutdown.signal)
  .catch((error) => { console.error("word-weaver worker failed", error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
