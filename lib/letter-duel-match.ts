import type { Prisma } from "@prisma/client";

export const DUEL_TARGET_WINS = 10;
export const DUEL_RECONNECT_MS = 30_000;
export const DUEL_REMATCH_MS = 60_000;

export function disconnectedDuelWinner(room: { playerOneId: string; playerTwoId: string | null; playerOneHeartbeat: Date; playerTwoHeartbeat: Date | null }, now: Date) {
  const oneGone = now.getTime() - room.playerOneHeartbeat.getTime() > DUEL_RECONNECT_MS;
  const twoGone = !room.playerTwoHeartbeat || now.getTime() - room.playerTwoHeartbeat.getTime() > DUEL_RECONNECT_MS;
  return oneGone && !twoGone ? room.playerTwoId : twoGone && !oneGone ? room.playerOneId : null;
}

// All terminal paths lock the same room as round creation and resolution.
// Abandoned rounds keep their existing SURRENDERED semantics for rankings.
export async function endDuelMatch(tx: Prisma.TransactionClient, connectionId: string, winnerUserId: string | null, reason: string, now = new Date()) {
  await tx.$queryRaw`SELECT "id" FROM "LetterDuelConnection" WHERE "id" = ${connectionId} FOR UPDATE`;
  const room = await tx.letterDuelConnection.findUnique({ where: { id: connectionId } });
  if (!room || room.status === "ENDED") return;
  await tx.gameSession.updateMany({ where: { status: "ACTIVE", letterDuelRound: { connectionId } }, data: { status: "SURRENDERED", finishedAt: now } });
  await tx.letterDuelRound.updateMany({ where: { connectionId, status: { in: ["PICKING", "ANSWERING", "JUDGING"] } }, data: { status: "CANCELLED", resolvedAt: now } });
  await tx.letterDuelConnection.update({ where: { id: connectionId }, data: { status: "ENDED", endedAt: now, matchWinnerUserId: winnerUserId, endReason: reason, stateVersion: { increment: 1 } } });
}
