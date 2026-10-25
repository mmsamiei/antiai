import { ownRatingChange, rateMatch } from "./competitive-rating";
import { geoRaceConfig, geoRaceType } from "./geo-race-config";
import { publicIdentity } from "./public-identity";
import { prisma } from "./prisma";
import { datasetFor, findItem, proximityRank, publicItem } from "./geo";
import { advanceCountryRace } from "./country-race-state";
import { animalDistance } from "./animals";
import { inviteTransaction, InviteError, sendInvite } from "./duel-invites";
import type { Prisma } from "@prisma/client";

async function owned(tx: Prisma.TransactionClient, userId: string, id: string) {
  const room = await tx.countryRace.findFirst({ where: { id, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
  if (!room) throw new InviteError("مسابقه پیدا نشد", 404);
  return room;
}
export async function readCountryRace(userId: string, id: string) {
  return inviteTransaction(async tx => {
    const room = await advanceCountryRace(tx, await owned(tx, userId, id));
    const gameType = geoRaceType(room.gameType);
    const [one, two, invite, guesses] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: room.playerOneId }, select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } }),
      tx.user.findUniqueOrThrow({ where: { id: room.playerTwoId }, select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } }),
      tx.duelInvite.findUnique({ where: { countryRaceId: id }, select: { id: true, startDeadline: true, reason: true } }),
      tx.countryRaceGuess.findMany({ where: { raceId: id }, orderBy: [{ rank: "asc" }, { createdAt: "asc" }] })
    ]);
    const own = guesses.filter(g => g.userId === userId), other = guesses.filter(g => g.userId !== userId);
    const isOne = room.playerOneId === userId;
    const ownTargetId = gameType === "ANIMAL" ? (isOne ? room.playerOneTargetId : room.playerTwoTargetId) : room.targetId;
    const selectedForOpponentId = isOne ? room.playerTwoTargetId : room.playerOneTargetId;
    const targetFor = (guess: typeof guesses[number]) => gameType === "ANIMAL"
      ? guess.userId === room.playerOneId ? room.playerOneTargetId : room.playerTwoTargetId
      : room.targetId;
    const describe = (g: typeof guesses[number]) => ({
      ...publicItem(findItem(gameType, g.itemId)!), rank: g.rank,
      ...(gameType === "ANIMAL" && targetFor(g) ? { distance: animalDistance(g.itemId, targetFor(g)!) } : {}),
      createdAt: g.createdAt,
    });
    const bestDistance = (rows: typeof guesses, targetId: string | null) => gameType === "ANIMAL" && rows[0] && targetId
      ? animalDistance(rows[0].itemId, targetId) : null;
    const ratingChange = room.status === "ENDED" ? ownRatingChange(await tx.competitiveResult.findUnique({ where: { matchKey: `race:${id}` } }), userId) : null;
    return { ratingChange, id, gameType, totalItems: datasetFor(gameType).length, status: room.status, deadline: room.deadline, serverNow: new Date(), winnerUserId: room.winnerUserId, endReason: room.endReason,
      ...(gameType === "ANIMAL" ? {
        phase: room.status === "ACTIVE" && !room.deadline ? "SELECTING" : "GUESSING",
        selectionDeadline: room.selectionDeadline,
        selectedForOpponent: selectedForOpponentId ? publicItem(findItem(gameType, selectedForOpponentId)!) : null,
        opponentHasSelected: Boolean(ownTargetId),
      } : {}),
      me: publicIdentity(userId === one.id ? one : two), opponent: publicIdentity(userId === one.id ? two : one), invite,
      myBestRank: own[0]?.rank ?? null, opponentBestRank: other[0]?.rank ?? null,
      ...(gameType === "ANIMAL" ? {
        myBestDistance: bestDistance(own, ownTargetId),
        opponentBestDistance: bestDistance(other, selectedForOpponentId),
      } : {}),
      guesses: own.map(describe),
      opponentConnected: Date.now() - +(userId === one.id ? room.playerTwoHeartbeat : room.playerOneHeartbeat) < 10_000,
      reconnectDeadline: new Date(+(userId === one.id ? room.playerTwoHeartbeat : room.playerOneHeartbeat) + 30_000),
      ...(room.status === "ENDED" ? {
        target: ownTargetId ? publicItem(findItem(gameType, ownTargetId)!, true) : null,
        ...(gameType === "ANIMAL" && selectedForOpponentId ? { opponentTarget: publicItem(findItem(gameType, selectedForOpponentId)!) } : {}),
        opponentGuesses: other.map(describe),
      } : {}) };
  });
}
export async function actCountryRace(userId: string, id: string, action: "heartbeat" | "guess" | "choose" | "leave", itemId?: string) {
  const error = await inviteTransaction(async tx => {
    let room = await advanceCountryRace(tx, await owned(tx, userId, id));
    if (room.status === "ENDED") return action === "guess" ? "مسابقه تمام شده است" : null;
    if (action === "heartbeat") {
      await tx.countryRace.update({ where: { id }, data: userId === room.playerOneId ? { playerOneHeartbeat: new Date() } : { playerTwoHeartbeat: new Date() } });
      return null;
    }
    if (action === "leave") {
      if (room.status === "ACTIVE") await rateMatch(tx, `race:${id}`, room.gameType, room.playerOneId, room.playerTwoId, userId === room.playerOneId ? room.playerTwoId : room.playerOneId);
      await tx.countryRace.update({ where: { id }, data: { status: "ENDED", endedAt: new Date(), endReason: room.status === "ACTIVE" ? "FORFEIT" : "CANCELLED", winnerUserId: room.status === "ACTIVE" ? userId === room.playerOneId ? room.playerTwoId : room.playerOneId : null } });
      return null;
    }
    if (room.status !== "ACTIVE") return "مسابقه هنوز شروع نشده است";
    const gameType = geoRaceType(room.gameType);
    const guess = findItem(gameType, itemId || "");
    if (!guess) return `${geoRaceConfig[gameType].noun} معتبر انتخاب کن`;
    if (action === "choose") {
      if (gameType !== "ANIMAL") return "این بازی مرحلهٔ انتخاب حیوان ندارد";
      const prior = userId === room.playerOneId ? room.playerTwoTargetId : room.playerOneTargetId;
      if (prior === guess.id) return null; // Retries never change a confirmed choice.
      if (prior) return "حیوان حریف را قبلاً انتخاب کرده‌ای";
      if (room.deadline || !room.selectionDeadline || room.selectionDeadline <= new Date()) return "مهلت انتخاب حیوان تمام شده است";
      room = await tx.countryRace.update({ where: { id }, data: userId === room.playerOneId
        ? { playerTwoTargetId: guess.id, playerOneHeartbeat: new Date() }
        : { playerOneTargetId: guess.id, playerTwoHeartbeat: new Date() } });
      await advanceCountryRace(tx, room);
      return null;
    }
    if (gameType === "ANIMAL" && !room.deadline) return "ابتدا مرحلهٔ انتخاب حیوان باید تمام شود";
    const targetId = gameType === "ANIMAL" ? (userId === room.playerOneId ? room.playerOneTargetId : room.playerTwoTargetId) : room.targetId;
    const target = findItem(gameType, targetId || "");
    if (!target) return "هدف مسابقه آماده نیست";
    const rank = guess.id === target.id ? 0 : proximityRank(gameType, guess, target) + 1;
    // Touch the locked room so concurrent transactions retry with a fresh snapshot.
    await tx.countryRace.update({ where: { id }, data: userId === room.playerOneId ? { playerOneHeartbeat: new Date() } : { playerTwoHeartbeat: new Date() } });
    await tx.countryRaceGuess.createMany({ data: [{ raceId: id, userId, itemId: guess.id, rank }], skipDuplicates: true });
    if (!rank) await rateMatch(tx, `race:${id}`, room.gameType, room.playerOneId, room.playerTwoId, userId);
    if (!rank) room = await tx.countryRace.update({ where: { id }, data: { status: "ENDED", winnerUserId: userId, endedAt: new Date(), endReason: "FOUND" } });
    return null;
  });
  if (error) throw new InviteError(error);
  return readCountryRace(userId, id);
}
export async function rematchCountryRace(userId: string, id: string) {
  const room = await prisma.countryRace.findFirst({ where: { id, status: "ENDED", OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
  if (!room) throw new InviteError("مسابقه پیدا نشد", 404);
  return sendInvite(userId, userId === room.playerOneId ? room.playerTwoId : room.playerOneId, geoRaceConfig[geoRaceType(room.gameType)].inviteKind);
}
