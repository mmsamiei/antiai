import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { datasetFor } from "./geo";

export const MATCH_ONLINE_MS = 20_000;
export const MATCH_OFFER_MS = 15_000;
export const MATCH_COOLDOWN_MS = 20_000;
const countries = datasetFor("COUNTRY");
type Tx = Prisma.TransactionClient;

async function lockUsers(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
}

async function liveContextMap(tx: Tx, userIds: string[], now: Date) {
  const rows = await tx.appPresence.findMany({ where: { userId: { in: userIds }, lastSeenAt: { gte: new Date(+now - MATCH_ONLINE_MS) } }, select: { userId: true, context: true } });
  const map = new Map<string, { present: boolean; busy: boolean }>();
  for (const row of rows) {
    const state = map.get(row.userId) || { present: false, busy: false };
    state.present = true;
    state.busy ||= row.context === "GAME";
    map.set(row.userId, state);
  }
  return map;
}

async function onlineSet(tx: Tx, userIds: string[], now: Date) {
  const rows = await tx.onlinePresence.findMany({ where: { userId: { in: userIds }, lastSeenAt: { gte: new Date(+now - MATCH_ONLINE_MS) } }, select: { userId: true } });
  return new Set(rows.map(row => row.userId));
}

async function gameBusySet(tx: Tx, userIds: string[]) {
  const [duels, races] = await Promise.all([
    tx.letterDuelConnection.findMany({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: userIds } }, { playerTwoId: { in: userIds } }] }, select: { playerOneId: true, playerTwoId: true } }),
    tx.countryRace.findMany({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: userIds } }, { playerTwoId: { in: userIds } }] }, select: { playerOneId: true, playerTwoId: true } }),
  ]);
  return new Set([...duels, ...races].flatMap(row => [row.playerOneId, row.playerTwoId]));
}

async function userCanMatch(tx: Tx, userId: string, now: Date) {
  const [online, contexts, busy, searches, offers, cooldown] = await Promise.all([
    onlineSet(tx, [userId], now), liveContextMap(tx, [userId], now), gameBusySet(tx, [userId]),
    tx.countryMatchSearch.count({ where: { userId, status: "ACTIVE" } }),
    tx.countryMatchOffer.count({ where: { recipientId: userId, status: "PENDING" } }),
    tx.countryMatchState.findUnique({ where: { userId }, select: { cooldownUntil: true } }),
  ]);
  return online.has(userId) && contexts.get(userId)?.present && !contexts.get(userId)?.busy && !busy.has(userId)
    && searches === 0 && offers === 0 && !(cooldown?.cooldownUntil && cooldown.cooldownUntil > now);
}

async function cancelSearchTx(tx: Tx, searchId: string, status: "CANCELLED" | "EXPIRED", reason: string, now: Date) {
  const search = await tx.countryMatchSearch.findUnique({ where: { id: searchId } });
  if (!search || search.status !== "ACTIVE") return;
  await tx.countryMatchOffer.updateMany({ where: { searchId, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: now } });
  await tx.countryMatchSearch.update({ where: { id: searchId }, data: { status } });
  void reason;
}

async function makeRaceTx(tx: Tx, senderId: string, recipientId: string, now: Date, searchId?: string, offerId?: string) {
  await lockUsers(tx, [senderId, recipientId]);
  const target = countries[randomInt(countries.length)];
  const race = await tx.countryRace.create({ data: { gameType: "COUNTRY", playerOneId: senderId, playerTwoId: recipientId, targetId: target.id } });
  const invite = await tx.duelInvite.create({ data: {
    gameKind: "COUNTRY_RACE", senderId, recipientId, countryRaceId: race.id,
    status: "ACCEPTED", expiresAt: new Date(+now + MATCH_OFFER_MS), respondedAt: now,
    startDeadline: new Date(+now + MATCH_OFFER_MS),
  } });
  await tx.duelInvite.updateMany({ where: { id: { not: invite.id }, status: "PENDING", OR: [{ senderId: { in: [senderId, recipientId] } }, { recipientId: { in: [senderId, recipientId] } }] }, data: { status: "CANCELLED", reason: "یکی از بازیکن‌ها وارد مسابقه شد", respondedAt: now } });
  await tx.countryMatchSearch.updateMany({ where: { userId: { in: [senderId, recipientId] }, status: "ACTIVE" }, data: { status: "MATCHED", ...(searchId ? { matchedRaceId: race.id } : {}) } });
  if (offerId) await tx.countryMatchOffer.update({ where: { id: offerId }, data: { status: "ACCEPTED", respondedAt: now, raceId: race.id } });
  await tx.countryMatchOffer.updateMany({ where: { status: "PENDING", OR: [{ senderId: { in: [senderId, recipientId] } }, { recipientId: { in: [senderId, recipientId] } }] }, data: { status: "CANCELLED", respondedAt: now } });
  return race;
}

export async function startCountryMatch(userId: string) {
  return prisma.$transaction(async tx => {
    const now = new Date();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728401, 902)`;
    await lockUsers(tx, [userId]);
    const existing = await tx.countryMatchSearch.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (existing) {
      await tx.countryMatchSearch.update({ where: { id: existing.id }, data: { lastSeenAt: now } });
      return existing;
    }
    if (!await userCanMatch(tx, userId, now)) throw new Error("MATCH_SEARCH_UNAVAILABLE");
    return tx.countryMatchSearch.create({ data: { userId, lastSeenAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelCountryMatch(userId: string) {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const search = await tx.countryMatchSearch.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (search) await cancelSearchTx(tx, search.id, "CANCELLED", "جست‌وجو لغو شد", now);
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readCountryMatch(userId: string) {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const search = await tx.countryMatchSearch.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { offers: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } }, recipient: { select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } } } } } });
    const incoming = await tx.countryMatchOffer.findFirst({ where: { recipientId: userId, status: "PENDING" }, include: { sender: { select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } } } });
    if (search?.status === "ACTIVE") await tx.countryMatchSearch.update({ where: { id: search.id }, data: { lastSeenAt: now } });
    const offer = incoming ? { ...incoming, sender: { ...incoming.sender, username: incoming.sender.showUsername ? incoming.sender.username : null } } : null;
    return { search: search ? { id: search.id, status: search.status, createdAt: search.createdAt, offer: search.offers[0] ? { id: search.offers[0].id, status: search.offers[0].status, expiresAt: search.offers[0].expiresAt, recipient: search.offers[0].recipient } : null } : null, incoming: offer, serverNow: now };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function respondToCountryMatch(userId: string, offerId: string, action: "accept" | "reject") {
  return prisma.$transaction(async tx => {
    const now = new Date();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728401, 902)`;
    const offer = await tx.countryMatchOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.recipientId !== userId) throw new Error("MATCH_OFFER_NOT_FOUND");
    await lockUsers(tx, [offer.senderId, offer.recipientId]);
    const current = await tx.countryMatchOffer.findUniqueOrThrow({ where: { id: offerId } });
    if (current.status !== "PENDING" || current.expiresAt <= now) throw new Error("MATCH_OFFER_EXPIRED");
    if (action === "reject") {
      await tx.countryMatchOffer.update({ where: { id: offerId }, data: { status: "REJECTED", respondedAt: now } });
      await tx.countryMatchState.upsert({ where: { userId }, create: { userId, cooldownUntil: new Date(+now + MATCH_COOLDOWN_MS), lastOfferedAt: now }, update: { cooldownUntil: new Date(+now + MATCH_COOLDOWN_MS), lastOfferedAt: now } });
      return { ok: true };
    }
    const [online, contexts, busy, user, searches] = await Promise.all([
      onlineSet(tx, [userId, offer.senderId], now), liveContextMap(tx, [userId, offer.senderId], now),
      gameBusySet(tx, [userId, offer.senderId]), tx.user.findUnique({ where: { id: userId }, select: { acceptsGameInvites: true } }),
      tx.countryMatchSearch.count({ where: { userId, status: "ACTIVE" } }),
    ]);
    if (!online.has(userId) || !online.has(offer.senderId) || !contexts.get(userId)?.present || contexts.get(userId)?.busy || !contexts.get(offer.senderId)?.present || contexts.get(offer.senderId)?.busy || busy.has(userId) || busy.has(offer.senderId) || !user?.acceptsGameInvites || searches) throw new Error("MATCH_OFFER_UNAVAILABLE");
    const senderPresent = online.has(offer.senderId);
    if (!senderPresent) throw new Error("MATCH_SENDER_OFFLINE");
    const race = await makeRaceTx(tx, offer.senderId, offer.recipientId, now, offer.searchId, offerId);
    return { ok: true, raceId: race.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function freeCandidates(tx: Tx, excluded: string[], now: Date) {
  const online = await tx.onlinePresence.findMany({ where: { lastSeenAt: { gte: new Date(+now - MATCH_ONLINE_MS) }, user: { acceptsGameInvites: true } }, select: { userId: true } });
  const ids = online.map(row => row.userId).filter(id => !excluded.includes(id));
  if (!ids.length) return [] as string[];
  const [contexts, busy, searches, pendingOffers, states] = await Promise.all([
    liveContextMap(tx, ids, now), gameBusySet(tx, ids),
    tx.countryMatchSearch.findMany({ where: { userId: { in: ids }, status: "ACTIVE" }, select: { userId: true } }),
    tx.countryMatchOffer.findMany({ where: { status: "PENDING", recipientId: { in: ids } }, select: { recipientId: true } }),
    tx.countryMatchState.findMany({ where: { userId: { in: ids } }, select: { userId: true, lastOfferedAt: true, cooldownUntil: true } }),
  ]);
  const searching = new Set(searches.map(x => x.userId));
  const offered = new Set(pendingOffers.map(x => x.recipientId));
  const stateByUser = new Map(states.map(state => [state.userId, state]));
  const candidates = ids.filter(id => contexts.get(id)?.present && !contexts.get(id)?.busy && !busy.has(id) && !searching.has(id) && !offered.has(id) && !(stateByUser.get(id)?.cooldownUntil && stateByUser.get(id)!.cooldownUntil! > now));
  const last = new Map(states.map(state => [state.userId, state.lastOfferedAt?.getTime() ?? 0]));
  return candidates.sort((a, b) => (last.get(a) || 0) - (last.get(b) || 0) || Math.random() - 0.5);
}

export async function processCountryMatchTick() {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(728401, 903) AS locked`;
    if (!lock[0]?.locked) return;
    const pending = await tx.countryMatchOffer.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
    for (const offer of pending) {
      const [online, contexts, busy] = await Promise.all([onlineSet(tx, [offer.senderId, offer.recipientId], now), liveContextMap(tx, [offer.senderId, offer.recipientId], now), gameBusySet(tx, [offer.senderId, offer.recipientId])]);
      const expired = offer.expiresAt <= now;
      const invalid = !online.has(offer.senderId) || !online.has(offer.recipientId) || contexts.get(offer.senderId)?.busy || contexts.get(offer.recipientId)?.busy || busy.has(offer.senderId) || busy.has(offer.recipientId);
      if (!expired && !invalid) continue;
      await tx.countryMatchOffer.update({ where: { id: offer.id }, data: { status: expired ? "EXPIRED" : "CANCELLED", respondedAt: now } });
      if (expired || online.has(offer.recipientId)) await tx.countryMatchState.upsert({ where: { userId: offer.recipientId }, create: { userId: offer.recipientId, cooldownUntil: new Date(+now + MATCH_COOLDOWN_MS), lastOfferedAt: now }, update: { cooldownUntil: new Date(+now + MATCH_COOLDOWN_MS), lastOfferedAt: now } });
      if (invalid && (!online.has(offer.senderId) || contexts.get(offer.senderId)?.busy || busy.has(offer.senderId))) await cancelSearchTx(tx, offer.searchId, online.has(offer.senderId) ? "CANCELLED" : "EXPIRED", "جست‌وجوگر در دسترس نیست", now);
    }
    const activeSearches = await tx.countryMatchSearch.findMany({ where: { status: "ACTIVE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const online = await onlineSet(tx, activeSearches.map(s => s.userId), now);
    const contexts = await liveContextMap(tx, activeSearches.map(s => s.userId), now);
    const busy = await gameBusySet(tx, activeSearches.map(s => s.userId));
    for (const search of activeSearches) {
      if (!online.has(search.userId) || now.getTime() - +search.lastSeenAt > MATCH_ONLINE_MS || contexts.get(search.userId)?.busy || busy.has(search.userId)) {
        await cancelSearchTx(tx, search.id, online.has(search.userId) ? "CANCELLED" : "EXPIRED", "حضور جست‌وجوگر پایان یافت", now);
      }
    }
    const waiting = await tx.countryMatchSearch.findMany({ where: { status: "ACTIVE", offers: { none: { status: "PENDING" } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (!waiting.length) return;
    const oldest = waiting[0];
    const secondQueued = waiting.find(search => search.id !== oldest.id);
    if (secondQueued) {
      const race = await makeRaceTx(tx, oldest.userId, secondQueued.userId, now, oldest.id);
      await tx.countryMatchSearch.update({ where: { id: secondQueued.id }, data: { matchedRaceId: race.id } });
      return;
    }
    const attempted = await tx.countryMatchOffer.findMany({ where: { searchId: oldest.id }, select: { recipientId: true } });
    const candidates = await freeCandidates(tx, [oldest.userId, ...attempted.map(x => x.recipientId)], now);
    const recipientId = candidates[0];
    if (!recipientId) return;
    await tx.countryMatchOffer.create({ data: { searchId: oldest.id, senderId: oldest.userId, recipientId, expiresAt: new Date(+now + MATCH_OFFER_MS) } });
    await tx.countryMatchState.upsert({ where: { userId: recipientId }, create: { userId: recipientId, lastOfferedAt: now }, update: { lastOfferedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function cancelMatchingForUser(tx: Tx, userId: string, reason: string, now = new Date()) {
  const active = await tx.countryMatchSearch.findMany({ where: { userId, status: "ACTIVE" } });
  for (const search of active) await cancelSearchTx(tx, search.id, "CANCELLED", reason, now);
  const incoming = await tx.countryMatchOffer.findMany({ where: { recipientId: userId, status: "PENDING" } });
  for (const offer of incoming) await tx.countryMatchOffer.update({ where: { id: offer.id }, data: { status: "CANCELLED", respondedAt: now } });
}
