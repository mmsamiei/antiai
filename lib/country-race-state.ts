import { rateMatch } from "./competitive-rating";
import type { CountryRace, Prisma } from "@prisma/client";

export const COUNTRY_RACE_MS = 200_000;
export const RACE_RECONNECT_MS = 30_000;
export function raceTimeoutWinner(one: string, two: string, bestOne: number | null, bestTwo: number | null) {
  const a = bestOne ?? Infinity, b = bestTwo ?? Infinity;
  return a === b ? null : a < b ? one : two;
}
export async function advanceCountryRace(tx: Prisma.TransactionClient, initial: CountryRace, now?: Date) {
  await tx.$queryRaw`SELECT "id" FROM "CountryRace" WHERE "id" = ${initial.id} FOR UPDATE`;
  const room = await tx.countryRace.findUniqueOrThrow({ where: { id: initial.id } });
  if (room.status !== "ACTIVE") return room;
  now ??= new Date();
  const oneGone = +now - +room.playerOneHeartbeat > RACE_RECONNECT_MS;
  const twoGone = +now - +room.playerTwoHeartbeat > RACE_RECONNECT_MS;
  const disconnectedAt = Math.min(+room.playerOneHeartbeat, +room.playerTwoHeartbeat) + RACE_RECONNECT_MS;
  const timedOut = room.deadline && room.deadline <= now && (!(oneGone || twoGone) || +room.deadline <= disconnectedAt);
  if (!timedOut && !oneGone && !twoGone) return room;
  let winner: string | null = null;
  if (timedOut) {
    const best = await tx.countryRaceGuess.groupBy({ by: ["userId"], where: { raceId: room.id }, _min: { rank: true } });
    winner = raceTimeoutWinner(room.playerOneId, room.playerTwoId, best.find(x => x.userId === room.playerOneId)?._min.rank ?? null, best.find(x => x.userId === room.playerTwoId)?._min.rank ?? null);
  } else winner = oneGone === twoGone ? null : oneGone ? room.playerTwoId : room.playerOneId;
  await rateMatch(tx, `race:${room.id}`, room.gameType, room.playerOneId, room.playerTwoId, winner);
  return tx.countryRace.update({ where: { id: room.id }, data: { status: "ENDED", endedAt: now, winnerUserId: winner, endReason: timedOut ? "TIMEOUT" : "DISCONNECTED" } });
}
export async function countryRaceBusy(tx: Prisma.TransactionClient, ids: string[]) {
  return tx.countryRace.count({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] } });
}
