import { randomUUID, createHash } from "node:crypto";
import { prisma } from "./prisma";
import { recordJudgeTiming } from "./judge-metrics";

/** A short database lease coordinates web processes without holding a connection during JEV calls. */
export async function sharedJudgment(keyParts: unknown[], read: () => Promise<number | null>, work: () => Promise<number>) {
  const key = createHash("sha256").update(JSON.stringify(keyParts)).digest("hex");
  const owner = randomUUID(), started = performance.now();
  while (performance.now() - started < 12000) {
    const cached = await read();
    if (cached !== null) return cached;
    const claimed = await prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO "PhraseHuntJudgmentLease" (key, owner, "expiresAt")
      VALUES (${key}, ${owner}, CURRENT_TIMESTAMP + interval '30 seconds')
      ON CONFLICT (key) DO UPDATE SET owner = EXCLUDED.owner, "expiresAt" = EXCLUDED."expiresAt"
      WHERE "PhraseHuntJudgmentLease"."expiresAt" <= CURRENT_TIMESTAMP
      RETURNING key
    `;
    if (claimed.length) {
      try {
        const saved = await read();
        return saved !== null ? saved : await work();
      } finally {
        await prisma.phraseHuntJudgmentLease.deleteMany({ where: { key, owner } }).catch(() => recordJudgeTiming("lease_cleanup_error", 0, true));
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  recordJudgeTiming("shared_wait_timeout", performance.now() - started, true);
  throw new Error("JEV_BUSY");
}
