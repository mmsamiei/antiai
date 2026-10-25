import { rateMatch } from "./competitive-rating";
import type { CountryRace, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { animalRecords } from "./data/animals";
import { animalDistance } from "./animals";

export const COUNTRY_RACE_MS = 200_000;
export const ANIMAL_SELECTION_MS = 20_000;
export const RACE_RECONNECT_MS = 30_000;
export function raceTimeoutWinner(one: string, two: string, bestOne: number | null, bestTwo: number | null) {
  const a = bestOne ?? Infinity, b = bestTwo ?? Infinity;
  return a === b ? null : a < b ? one : two;
}
export async function advanceCountryRace(tx: Prisma.TransactionClient, initial: CountryRace, now?: Date) {
  await tx.$queryRaw`SELECT "id" FROM "CountryRace" WHERE "id" = ${initial.id} FOR UPDATE`;
  let room = await tx.countryRace.findUniqueOrThrow({ where: { id: initial.id } });
  if (room.status !== "ACTIVE") return room;
  now ??= new Date();
  if (room.gameType === "ANIMAL" && !room.deadline && room.selectionDeadline &&
      (room.selectionDeadline <= now || room.playerOneTargetId && room.playerTwoTargetId)) {
    // Target fields belong to the guessing player; their opponent selects them.
    const startsAt = room.selectionDeadline <= now ? room.selectionDeadline : now;
    room = await tx.countryRace.update({ where: { id: room.id }, data: {
      playerOneTargetId: room.playerOneTargetId || animalRecords[randomInt(animalRecords.length)].id,
      playerTwoTargetId: room.playerTwoTargetId || animalRecords[randomInt(animalRecords.length)].id,
      startedAt: startsAt, deadline: new Date(+startsAt + COUNTRY_RACE_MS),
    } });
  }
  const oneGone = +now - +room.playerOneHeartbeat > RACE_RECONNECT_MS;
  const twoGone = +now - +room.playerTwoHeartbeat > RACE_RECONNECT_MS;
  const disconnectedAt = Math.min(+room.playerOneHeartbeat, +room.playerTwoHeartbeat) + RACE_RECONNECT_MS;
  const timedOut = room.deadline && room.deadline <= now && (!(oneGone || twoGone) || +room.deadline <= disconnectedAt);
  if (!timedOut && !oneGone && !twoGone) return room;
  let winner: string | null = null;
  if (timedOut) {
    if (room.gameType === "ANIMAL") {
      const guesses = await tx.countryRaceGuess.findMany({ where: { raceId: room.id }, orderBy: [{ rank: "asc" }, { createdAt: "asc" }] });
      const best = new Map<string, number>();
      for (const guess of guesses) {
        if (best.has(guess.userId)) continue;
        const targetId = guess.userId === room.playerOneId ? room.playerOneTargetId : room.playerTwoTargetId;
        if (targetId) best.set(guess.userId, animalDistance(guess.itemId, targetId));
      }
      winner = raceTimeoutWinner(room.playerOneId, room.playerTwoId, best.get(room.playerOneId) ?? null, best.get(room.playerTwoId) ?? null);
    } else {
      const best = await tx.countryRaceGuess.groupBy({ by: ["userId"], where: { raceId: room.id }, _min: { rank: true } });
      winner = raceTimeoutWinner(room.playerOneId, room.playerTwoId, best.find(x => x.userId === room.playerOneId)?._min.rank ?? null, best.find(x => x.userId === room.playerTwoId)?._min.rank ?? null);
    }
  } else winner = oneGone === twoGone ? null : oneGone ? room.playerTwoId : room.playerOneId;
  await rateMatch(tx, `race:${room.id}`, room.gameType, room.playerOneId, room.playerTwoId, winner);
  return tx.countryRace.update({ where: { id: room.id }, data: { status: "ENDED", endedAt: now, winnerUserId: winner, endReason: timedOut ? "TIMEOUT" : "DISCONNECTED" } });
}
export async function countryRaceBusy(tx: Prisma.TransactionClient, ids: string[]) {
  return tx.countryRace.count({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] } });
}
