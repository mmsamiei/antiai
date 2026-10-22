import { publicIdentity } from "./public-identity";
import { randomInt } from "crypto";
import { datasetFor } from "./geo";
import { geoRaceConfig, geoRaceType } from "./geo-race-config";
import { advanceCountryRace, countryRaceBusy } from "./country-race-state";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { disconnectedDuelWinner, endDuelMatch } from "./letter-duel-match";
import { cancelMatchingForUser } from "./country-matchmaking";

export const INVITE_MS = 60_000;
export const ONLINE_MS = 20_000;
export const READY_MS = 15_000;
export const publicPlayerSelect = { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } as const;
export const inviteInclude = { sender: { select: publicPlayerSelect }, recipient: { select: publicPlayerSelect }, connection: { select: { status: true } }, countryRace: { select: { status: true } } } as const;
type Tx = Prisma.TransactionClient;
export class InviteError extends Error { constructor(message: string, public status = 409) { super(message); } }
export async function inviteTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2034" || e.code === "P2010" && ["40001", "40P01"].includes(String(e.meta?.code))) && attempt < 3) continue; throw e; }
  }
}
export async function lockPlayers(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
}
export function pendingInvalidReason(expiresAt: Date, now: Date, senderOnline: boolean, recipientOnline: boolean, busy: boolean) {
  if (expiresAt <= now) return "مهلت دعوت تمام شد";
  if (!senderOnline || !recipientOnline) return "یکی از بازیکن‌ها دیگر آنلاین نیست";
  if (busy) return "یکی از بازیکن‌ها وارد بازی دونفرهٔ دیگری شده است";
  return null;
}
// Expiry is enforced on reads and writes, never trusted to a browser timer.
export async function reconcileInvites(tx: Tx, userId: string, now = new Date()) {
  const races = await tx.countryRace.findMany({ where: { status: "ACTIVE", OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
  for (const race of races) await advanceCountryRace(tx, race, now);
  // Release abandoned legacy rooms as well; otherwise an old WAITING room blocks invitations forever.
  const stale = await tx.letterDuelConnection.findMany({ where: {
    status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }],
    AND: [{ OR: [{ playerOneHeartbeat: { lt: new Date(now.getTime() - 30_000) } }, { playerTwoId: { not: null }, playerTwoHeartbeat: { lt: new Date(now.getTime() - 30_000) } }] }],
    NOT: { directInvite: { is: { status: "ACCEPTED" } }, status: "WAITING" }
  } });
  for (const room of stale) {
    await endDuelMatch(tx, room.id, room.status === "ACTIVE" ? disconnectedDuelWinner(room, now) : null, room.status === "ACTIVE" ? "DISCONNECTED" : "CANCELLED", now);
  }
  const invites = await tx.duelInvite.findMany({ where: { AND: [{ OR: [{ senderId: userId }, { recipientId: userId }] }, { OR: [{ status: "PENDING" }, { status: "ACCEPTED", OR: [{ connection: { is: { status: "WAITING" } } }, { countryRace: { is: { status: "WAITING" } } }, { senderReadyAt: null }, { recipientReadyAt: null }] }] }] }, include: { connection: true, countryRace: true } });
  const ids = [...new Set(invites.flatMap(i => [i.senderId, i.recipientId]))];
  const online = new Set((await tx.onlinePresence.findMany({ where: { userId: { in: ids }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } }, select: { userId: true } })).map(p => p.userId));
  const duels = await tx.letterDuelConnection.findMany({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] }, select: { id: true, playerOneId: true, playerTwoId: true, createdAt: true } });
  const raceRooms = await tx.countryRace.findMany({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] }, select: { id: true, playerOneId: true, playerTwoId: true, createdAt: true } });
  const busy = [...duels, ...raceRooms];
  for (const invite of invites) {
    let reason: string | null = null;
    if (invite.status === "PENDING") reason = pendingInvalidReason(invite.expiresAt, now, online.has(invite.senderId), online.has(invite.recipientId), busy.some(c => c.playerOneId === invite.senderId || c.playerTwoId === invite.senderId || c.createdAt > invite.createdAt && (c.playerOneId === invite.recipientId || c.playerTwoId === invite.recipientId)));
    else if ((invite.connection?.status === "WAITING" || invite.countryRace?.status === "WAITING") && invite.startDeadline && invite.startDeadline <= now) reason = "هر دو بازیکن به‌موقع وارد اتاق نشدند";
    else if ((invite.connection?.status === "ENDED" || invite.countryRace?.status === "ENDED") && (!invite.senderReadyAt || !invite.recipientReadyAt)) reason = "شروع بازی لغو شد";
    if (!reason) continue;
    const changed = await tx.duelInvite.updateMany({ where: { id: invite.id, status: invite.status }, data: { status: invite.status === "PENDING" && invite.expiresAt <= now ? "EXPIRED" : "CANCELLED", reason, respondedAt: now } });
    if (changed.count && invite.connectionId) await tx.letterDuelConnection.updateMany({ where: { id: invite.connectionId, status: "WAITING" }, data: { status: "ENDED", endedAt: now } });
    if (changed.count && invite.countryRaceId) await tx.countryRace.updateMany({ where: { id: invite.countryRaceId, status: "WAITING" }, data: { status: "ENDED", endedAt: now, endReason: "CANCELLED" } });
  }
}
export async function readInvites(userId: string) {
  // Most polls have no live invitation or room. Avoid reserving a transaction
  // connection for reconciliation when there is nothing to reconcile.
  const idle = await prisma.$queryRaw<{ acceptsGameInvites: boolean }[]>`
    SELECT u."acceptsGameInvites" FROM "User" u WHERE u.id = ${userId}
    AND NOT EXISTS (SELECT 1 FROM "DuelInvite" i WHERE (i."senderId" = u.id OR i."recipientId" = u.id)
      AND (i.status = 'PENDING' OR (i.status = 'ACCEPTED' AND (i."senderReadyAt" IS NULL OR i."recipientReadyAt" IS NULL))))
    AND NOT EXISTS (SELECT 1 FROM "CountryRace" r WHERE (r."playerOneId" = u.id OR r."playerTwoId" = u.id) AND r.status IN ('WAITING','ACTIVE'))
    AND NOT EXISTS (SELECT 1 FROM "LetterDuelConnection" r WHERE (r."playerOneId" = u.id OR r."playerTwoId" = u.id) AND r.status IN ('WAITING','ACTIVE'))
  `;
  if (idle[0]) {
    const invites = await prisma.duelInvite.findMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] }, include: inviteInclude, orderBy: { createdAt: "desc" }, take: 100 });
    // An invitation may arrive between the idle probe and history read.
    // Reconcile any newly observed live invitation through the normal path.
    if (!invites.some(i => i.status === "PENDING" || i.status === "ACCEPTED" && (i.connection?.status === "WAITING" || i.connection?.status === "ACTIVE" || i.countryRace?.status === "WAITING" || i.countryRace?.status === "ACTIVE"))) {
      return { ...idle[0], invites: invites.map(i => ({ ...i, sender: publicIdentity(i.sender), recipient: publicIdentity(i.recipient) })), serverNow: new Date() };
    }
  }

  return inviteTransaction(async tx => {
    await reconcileInvites(tx, userId);
    const participants = { OR: [{ senderId: userId }, { recipientId: userId }] };
    const [user, active, recent] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { acceptsGameInvites: true } }),
      tx.duelInvite.findMany({ where: { ...participants, AND: [{ OR: [{ status: "PENDING" }, { status: "ACCEPTED", OR: [{ connection: { is: { status: { in: ["WAITING", "ACTIVE"] } } } }, { countryRace: { is: { status: { in: ["WAITING", "ACTIVE"] } } } }] }] }] }, include: inviteInclude }),
      tx.duelInvite.findMany({ where: participants, include: inviteInclude, orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    // Never truncate a pending invitation or the active room behind older history.
    const invites = [...new Map([...recent, ...active].map(i => [i.id, i])).values()].sort((a, b) => +b.createdAt - +a.createdAt);
    return { ...user, invites: invites.map(i => ({ ...i, sender: publicIdentity(i.sender), recipient: publicIdentity(i.recipient) })), serverNow: new Date() };
  });
}
export async function sendInvite(senderId: string, recipientId: string, gameKind: "LETTER_DUEL" | "COUNTRY_RACE" | "CITY_RACE" = "LETTER_DUEL", rematchOf?: string) {
  if (senderId === recipientId) throw new InviteError("نمی‌توانی خودت را دعوت کنی", 400);
  await inviteTransaction(async tx => { await reconcileInvites(tx, senderId); await reconcileInvites(tx, recipientId); });
  return inviteTransaction(async tx => {
    await lockPlayers(tx, [senderId, recipientId]);
    await reconcileInvites(tx, senderId); await reconcileInvites(tx, recipientId);
    const recipient = await tx.user.findUnique({ where: { id: recipientId } });
    if (!recipient) throw new InviteError("بازیکن پیدا نشد", 404);
    if (!recipient.acceptsGameInvites) throw new InviteError("این بازیکن دریافت دعوت را خاموش کرده است");
    const now = new Date();
    const online = await tx.onlinePresence.count({ where: { userId: { in: [senderId, recipientId] }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } });
    if (online !== 2) throw new InviteError("برای دعوت، هر دو بازیکن باید آنلاین باشند");
    if (await tx.letterDuelConnection.count({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: senderId }, { playerTwoId: senderId }] } })) throw new InviteError("یکی از بازیکن‌ها در بازی دونفرهٔ دیگری است");
    if (await countryRaceBusy(tx, [senderId])) throw new InviteError("ابتدا از مسابقهٔ فعلی خارج شو");
    if (await tx.duelInvite.count({ where: { senderId, status: "PENDING" } })) throw new InviteError("ابتدا دعوت قبلی را لغو کن");
    const previous = rematchOf ? await tx.countryRace.findFirst({ where: { id: rematchOf, status: "ENDED", OR: [{ playerOneId: senderId, playerTwoId: recipientId }, { playerOneId: recipientId, playerTwoId: senderId }] } }) : null;
    const firstRematch = previous?.endedAt && !await tx.duelInvite.count({ where: { createdAt: { gte: previous.endedAt }, OR: [{ senderId, recipientId }, { senderId: recipientId, recipientId: senderId }] } });
    if (!firstRematch && await tx.duelInvite.count({ where: { senderId, recipientId, createdAt: { gt: new Date(now.getTime() - 120_000) } } })) throw new InviteError("برای دعوت دوباره به این بازیکن دو دقیقه صبر کن", 429);
    const invite = await tx.duelInvite.create({ data: { senderId, recipientId, gameKind, expiresAt: new Date(now.getTime() + INVITE_MS) }, include: inviteInclude });
    return { ...invite, sender: publicIdentity(invite.sender), recipient: publicIdentity(invite.recipient) };
  });
}
export async function actOnInvite(userId: string, id: string, action: "accept" | "reject" | "cancel" | "ready") {
  // Commit reconciliation separately so failed/stale actions cannot roll expiry back.
  await inviteTransaction(tx => reconcileInvites(tx, userId));
  return inviteTransaction(async tx => {
    const initial = await tx.duelInvite.findUnique({ where: { id } });
    if (!initial || ![initial.senderId, initial.recipientId].includes(userId)) throw new InviteError("دعوت پیدا نشد", 404);
    await lockPlayers(tx, [initial.senderId, initial.recipientId]);
    const invite = await tx.duelInvite.findUniqueOrThrow({ where: { id }, include: { connection: true, countryRace: true } });
    const now = new Date();
    if (action === "ready") {
      const room = invite.countryRace || invite.connection;
      if (invite.status !== "ACCEPTED" || (!invite.connectionId && !invite.countryRaceId) || !invite.startDeadline || (room?.status !== "ACTIVE" && invite.startDeadline <= now)) throw new InviteError("این دعوت دیگر آمادهٔ شروع نیست");
      if (room?.status === "ENDED") throw new InviteError("بازی تمام شده است");
      if (await tx.onlinePresence.count({ where: { userId: { in: [invite.senderId, invite.recipientId] }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } }) !== 2) throw new InviteError("یکی از بازیکن‌ها دیگر آنلاین نیست");
      const ready = await tx.duelInvite.update({ where: { id }, data: invite.senderId === userId ? { senderReadyAt: now } : { recipientReadyAt: now } });
      if (ready.senderReadyAt && ready.recipientReadyAt && room?.status === "WAITING") {
        if (invite.countryRaceId) await tx.countryRace.update({ where: { id: invite.countryRaceId }, data: { status: "ACTIVE", startedAt: now, deadline: new Date(+now + geoRaceConfig[geoRaceType(invite.countryRace?.gameType)].durationMs), playerOneHeartbeat: now, playerTwoHeartbeat: now } });
        else await tx.letterDuelConnection.update({ where: { id: invite.connectionId! }, data: { status: "ACTIVE", startedAt: now, playerOneHeartbeat: now, playerTwoHeartbeat: now } });
      }
      return ready;
    }
    if (action === "accept" && invite.recipientId !== userId || action === "reject" && invite.recipientId !== userId || action === "cancel" && invite.senderId !== userId) throw new InviteError("اجازهٔ این عملیات را نداری", 403);
    if (action === "accept" && invite.status === "ACCEPTED" && (invite.countryRace || invite.connection)?.status !== "ENDED") return invite;
    if (invite.status !== "PENDING" || invite.expiresAt <= now) throw new InviteError(invite.reason || "این دعوت دیگر معتبر نیست");
    if (action !== "accept") return tx.duelInvite.update({ where: { id }, data: { status: action === "reject" ? "REJECTED" : "CANCELLED", reason: action === "reject" ? "دعوت رد شد" : "فرستنده دعوت را لغو کرد", respondedAt: now } });
    const online = await tx.onlinePresence.count({ where: { userId: { in: [invite.senderId, invite.recipientId] }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } });
    if (online !== 2) throw new InviteError("یکی از بازیکن‌ها دیگر آنلاین نیست");
    const recipient = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!recipient.acceptsGameInvites) throw new InviteError("دریافت دعوت خاموش است");
    const ids = [invite.senderId, invite.recipientId];
    for (const id of ids) await cancelMatchingForUser(tx, id, "یکی از بازیکن‌ها دعوت مستقیم دیگری را پذیرفت", now);
    if (await tx.letterDuelConnection.count({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] } })) throw new InviteError("یکی از بازیکن‌ها در بازی دونفرهٔ دیگری است");
    if (await countryRaceBusy(tx, ids)) throw new InviteError("یکی از بازیکن‌ها در مسابقهٔ دیگری است");
    const gameType = invite.gameKind === "CITY_RACE" ? "IRAN_CITY" : "COUNTRY";
    const pool = datasetFor(gameType);
    const countryRace = invite.gameKind === "COUNTRY_RACE" || invite.gameKind === "CITY_RACE" ? await tx.countryRace.create({ data: { gameType, playerOneId: invite.senderId, playerTwoId: invite.recipientId, targetId: pool[randomInt(pool.length)].id } }) : null;
    const connection = countryRace ? null : await tx.letterDuelConnection.create({ data: { mode: "PRIVATE", status: "WAITING", playerOneId: invite.senderId, playerTwoId: invite.recipientId } });
    await tx.duelInvite.updateMany({ where: { id: { not: id }, status: "PENDING", OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] }, data: { status: "CANCELLED", reason: "یکی از بازیکن‌ها دعوت دیگری را پذیرفت", respondedAt: now } });
    return tx.duelInvite.update({ where: { id }, data: { status: "ACCEPTED", respondedAt: now, connectionId: connection?.id, countryRaceId: countryRace?.id, startDeadline: new Date(now.getTime() + READY_MS) } });
  });
}
export async function setInvitePreference(userId: string, enabled: boolean) {
  return inviteTransaction(async tx => {
    await lockPlayers(tx, [userId]);
    await tx.user.update({ where: { id: userId }, data: { acceptsGameInvites: enabled } });
    if (!enabled) {
      await tx.duelInvite.updateMany({ where: { recipientId: userId, status: "PENDING" }, data: { status: "CANCELLED", reason: "دریافت دعوت خاموش شد", respondedAt: new Date() } });
      await cancelMatchingForUser(tx, userId, "دریافت دعوت خاموش شد");
    }
  });
}
