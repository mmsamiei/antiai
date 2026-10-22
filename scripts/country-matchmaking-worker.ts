import "dotenv/config";
import { prisma } from "../lib/prisma";
import { processCountryMatchTick } from "../lib/country-matchmaking";

const shutdown = new AbortController();
process.on("SIGTERM", () => shutdown.abort());
process.on("SIGINT", () => shutdown.abort());
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.info("country matchmaking worker started");
  while (!shutdown.signal.aborted) {
    try { await processCountryMatchTick(); }
    catch (error) { console.error("country matchmaking tick failed", error instanceof Error ? error.message : "unknown"); }
    if (!shutdown.signal.aborted) await wait(1_000);
  }
}

void run().finally(() => prisma.$disconnect());
