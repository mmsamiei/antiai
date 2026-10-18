import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { WORD_WEAVER_PRESENCE_MS } from "./word-weaver-core";

export async function readWordWeaverReadiness(tx: Prisma.TransactionClient, roundId: string, now: Date) {
  const cutoff = new Date(now.getTime() - WORD_WEAVER_PRESENCE_MS);
  const counts = await tx.$queryRaw<{ players: bigint; missing: bigint }[]>`
    SELECT COUNT(DISTINCT p."userId") AS players,
      COUNT(DISTINCT p."userId") FILTER (WHERE e."id" IS NULL) AS missing
    FROM "WordWeaverPresence" p
    LEFT JOIN "WordWeaverEntry" e ON e."userId" = p."userId" AND e."roundId" = ${roundId}
    WHERE p."lastSeenAt" >= ${cutoff}`;
  return { players: Number(counts[0]?.players || 0), missing: Number(counts[0]?.missing || 0) };
}

export async function advanceWordWeaverWritingRound(roundId: string) {
  return prisma.$transaction(async (tx) => {
    // The same lock protects final submissions and the transition to judging.
    await tx.$queryRaw`SELECT "id" FROM "WordWeaverRound" WHERE "id" = ${roundId} FOR UPDATE`;
    const round = await tx.wordWeaverRound.findUnique({ where: { id: roundId } });
    if (!round || round.status !== "WRITING") return null;
    const now = new Date();
    const { players, missing } = await readWordWeaverReadiness(tx, roundId, now);
    if (!players) {
      await tx.wordWeaverBotTurn.updateMany({ where: { roundId, status: { in: ["PENDING", "GENERATING"] } }, data: { status: "FAILED", leaseToken: null, leaseUntil: null } });
      await tx.wordWeaverRound.update({ where: { id: roundId }, data: { status: "CLOSED" } });
      await tx.wordWeaverRoom.updateMany({ where: { id: "public", currentRoundId: roundId }, data: { currentRoundId: null } });
      return "CLOSED";
    }
    const pendingBots = await tx.wordWeaverBotTurn.count({ where: { roundId, status: { in: ["PENDING", "GENERATING"] } } });
    if ((missing > 0 || pendingBots > 0) && round.writeDeadline > now) return "WAITING";
    await tx.wordWeaverBotTurn.updateMany({ where: { roundId, status: { in: ["PENDING", "GENERATING"] } }, data: { status: "FAILED", leaseToken: null, leaseUntil: null } });
    await tx.wordWeaverRound.update({ where: { id: roundId }, data: { status: "JUDGING", judgeStartedAt: now, isSolo: players === 1 } });
    await tx.wordWeaverEntry.updateMany({ where: { roundId, status: "PENDING" }, data: { lockedAt: now } });
    return "JUDGING";
  });
}
