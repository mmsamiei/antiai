import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { datasetFor, findItem, proximityRank, publicItem } from "./geo";
import { countryChallengeTimes, countryChallengeWindow } from "./country-challenge-schedule";
import { cancelMatchingForUser } from "./country-matchmaking";

import { geoRaceType, type GeoRaceType } from "./geo-race-config";

type Tx = Prisma.TransactionClient;

async function ensureChallenge(tx: Tx, now = new Date(), gameType: GeoRaceType = "COUNTRY") {
  const window = countryChallengeWindow(now, gameType);
  const current = await tx.countryChallenge.findUnique({ where: { gameType_startsAt: { gameType, startsAt: window.startsAt } } });
  if (current && +current.endsAt === +window.endsAt) return current;
  // Only creation/deadline changes need a global lock. Ordinary reads and
  // guesses must not serialize all players behind challenge creation.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728401, 901)`;
  const existing = await tx.countryChallenge.findUnique({ where: { gameType_startsAt: { gameType, startsAt: window.startsAt } } });
  if (existing) return +existing.endsAt === +window.endsAt ? existing : tx.countryChallenge.update({ where: { id: existing.id }, data: { endsAt: window.endsAt } });
  const used = new Set((await tx.countryChallenge.findMany({ where: { gameType }, select: { targetId: true } })).map(x => x.targetId));
  const pool = datasetFor(gameType);
  const unseen = pool.filter(item => !used.has(item.id));
  const target = (unseen.length ? unseen : pool)[randomInt(unseen.length || pool.length)];
  return tx.countryChallenge.create({ data: { id: gameType === "COUNTRY" ? window.id : `${gameType}:${window.id}`, gameType, startsAt: window.startsAt, endsAt: window.endsAt, targetId: target.id } });
}

export async function ensureCountryChallengeAt(now: Date, gameType: GeoRaceType) {
  return prisma.$transaction(tx => ensureChallenge(tx, now, gameType), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function readEntry(tx: Tx, challengeId: string, userId: string) {
  return tx.countryChallengeEntry.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
    include: { guesses: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}

function serialize(challenge: { id: string; startsAt: Date; endsAt: Date; targetId: string; gameType: string }, entry: Awaited<ReturnType<typeof readEntry>>, now: Date) {
  const gameType = geoRaceType(challenge.gameType);
  const ended = now >= challenge.endsAt;
  const reveal = ended || entry?.status === "WON" || entry?.status === "SURRENDERED";
  const target = findItem(geoRaceType(challenge.gameType), challenge.targetId);
  return {
    challenge: { ...countryChallengeTimes(challenge.startsAt, now, challenge.endsAt), id: challenge.id, gameType, endsAt: challenge.endsAt, ended, target: reveal && target ? publicItem(target, true) : null },
    entry: entry ? {
      id: entry.id,
      status: entry.status === "ACTIVE" && ended ? "EXPIRED" : entry.status,
      guessCount: entry.guessCount,
      bestRank: entry.bestRank,
      bestRankAt: entry.bestRankAt,
      solvedAt: entry.solvedAt,
      guesses: entry.guesses.map(guess => {
        const item = findItem(gameType, guess.itemId);
        return item ? { ...publicItem(item), rank: guess.rank, createdAt: guess.createdAt } : null;
      }).filter(Boolean),
      target: reveal && target ? publicItem(target, true) : null,
    } : null,
    totalItems: datasetFor(gameType).length,
  };
}

export async function readCountryChallenge(userId: string, requestedId?: string, gameType: GeoRaceType = "COUNTRY") {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const challenge = requestedId
      ? await tx.countryChallenge.findUnique({ where: { id: requestedId } })
      : await ensureChallenge(tx, now, gameType);
    if (!challenge || challenge.gameType !== gameType) return null;
    const entry = await readEntry(tx, challenge.id, userId);
    if (entry?.status === "ACTIVE" && now >= challenge.endsAt) {
      await tx.countryChallengeEntry.update({ where: { id: entry.id }, data: { status: "EXPIRED", finishedAt: challenge.endsAt } });
      entry.status = "EXPIRED";
    }
    return serialize(challenge, entry, now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function listCountryChallenges(userId: string, gameType: GeoRaceType = "COUNTRY") {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const current = await ensureChallenge(tx, now, gameType);
    const challenges = await tx.countryChallenge.findMany({ where: { gameType }, orderBy: { startsAt: "desc" }, take: 30 });
    const entries = await tx.countryChallengeEntry.findMany({ where: { userId, challengeId: { in: challenges.map(c => c.id) } } });
    const byChallenge = new Map(entries.map(entry => [entry.challengeId, entry]));
    return {
      challenges: challenges.map(challenge => {
        const entry = byChallenge.get(challenge.id);
        return { ...countryChallengeTimes(challenge.startsAt, now, challenge.endsAt), id: challenge.id, gameType, ended: now >= challenge.endsAt, entryStatus: entry?.status ?? null, guessCount: entry?.guessCount ?? 0, target: now >= challenge.endsAt ? findItem(geoRaceType(challenge.gameType), challenge.targetId)?.name ?? null : null };
      }),
      currentId: current.id,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function startCountryChallenge(userId: string, gameType: GeoRaceType = "COUNTRY") {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const challenge = await ensureChallenge(tx, now, gameType);
    if (now >= challenge.endsAt) throw new Error("CHALLENGE_ENDED");
    await cancelMatchingForUser(tx, userId, "وارد چالش روزانه شدی", now);
    const entry = await tx.countryChallengeEntry.upsert({
      where: { challengeId_userId: { challengeId: challenge.id, userId } },
      create: { challengeId: challenge.id, userId },
      update: {},
      include: { guesses: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    return serialize(challenge, entry, now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function submitCountryChallengeGuess(userId: string, itemId: string, gameType: GeoRaceType = "COUNTRY") {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const challenge = await ensureChallenge(tx, now, gameType);
    if (now >= challenge.endsAt) throw new Error("CHALLENGE_ENDED");
    const entry = await tx.countryChallengeEntry.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId } } });
    if (!entry) throw new Error("CHALLENGE_NOT_STARTED");
    await tx.$queryRaw`SELECT "id" FROM "CountryChallengeEntry" WHERE "id" = ${entry.id} FOR UPDATE`;
    const locked = await tx.countryChallengeEntry.findUniqueOrThrow({ where: { id: entry.id } });
    if (locked.status !== "ACTIVE") throw new Error("CHALLENGE_ENTRY_CLOSED");
    const country = findItem(gameType, itemId);
    if (!country) throw new Error("ITEM_NOT_FOUND");
    const prior = await tx.countryChallengeGuess.findUnique({ where: { entryId_itemId: { entryId: entry.id, itemId: country.id } } });
    if (!prior) {
      const target = findItem(geoRaceType(challenge.gameType), challenge.targetId)!;
      const rank = country.id === target.id ? 0 : proximityRank(gameType, country, target) + 1;
      await tx.countryChallengeGuess.create({ data: { entryId: entry.id, userId, itemId: country.id, rank, createdAt: now } });
      const bestRank = locked.bestRank === null || rank < locked.bestRank;
      await tx.countryChallengeEntry.update({ where: { id: entry.id }, data: {
        guessCount: { increment: 1 },
        ...(bestRank ? { bestRank: rank, bestRankAt: now } : {}),
        ...(rank === 0 ? { status: "WON", solvedAt: now, finishedAt: now } : {}),
      } });
    }
    const updated = await readEntry(tx, challenge.id, userId);
    return serialize(challenge, updated, now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function surrenderCountryChallenge(userId: string, gameType: GeoRaceType = "COUNTRY") {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const challenge = await ensureChallenge(tx, now, gameType);
    const entry = await tx.countryChallengeEntry.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId } } });
    if (!entry) throw new Error("CHALLENGE_NOT_STARTED");
    if (entry.status === "ACTIVE" && now < challenge.endsAt) {
      await tx.countryChallengeEntry.update({ where: { id: entry.id }, data: { status: "SURRENDERED", finishedAt: now } });
    }
    return serialize(challenge, await readEntry(tx, challenge.id, userId), now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function countryChallengeLeaderboard(userId: string, challengeId?: string | null, gameType: GeoRaceType = "COUNTRY") {
  return prisma.$transaction(async tx => {
    const now = new Date();
    const current = await ensureChallenge(tx, now, gameType);
    const selectedId = challengeId || current.id;
    const challenge = await tx.countryChallenge.findUnique({ where: { id: selectedId } });
    if (!challenge || challenge.gameType !== gameType) return null;
    const entries = await tx.countryChallengeEntry.findMany({ where: { challengeId: selectedId }, include: { user: { select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } }, guesses: true } });
    const ended = now >= challenge.endsAt;
    entries.sort((a, b) => {
      const aSolved = a.status === "WON", bSolved = b.status === "WON";
      if (aSolved !== bSolved) return aSolved ? -1 : 1;
      if (aSolved) return a.guessCount - b.guessCount || +(a.solvedAt || a.finishedAt || 0) - +(b.solvedAt || b.finishedAt || 0) || a.userId.localeCompare(b.userId);
      return (a.bestRank ?? Number.MAX_SAFE_INTEGER) - (b.bestRank ?? Number.MAX_SAFE_INTEGER) || +(a.bestRankAt || a.finishedAt || a.createdAt) - +(b.bestRankAt || b.finishedAt || b.createdAt) || a.userId.localeCompare(b.userId);
    });
    const rows = entries.map((entry, index) => ({
      rank: index + 1, userId: entry.userId, displayName: `${entry.user.firstName || ""} ${entry.user.lastName || ""}`.trim() || (entry.user.showUsername ? entry.user.username : null) || "بازیکن",
      photoUrl: entry.user.photoUrl, wins: entry.status === "WON" ? 1 : 0, averageGuesses: entry.guessCount, bestGame: entry.guessCount,
      guessCount: entry.guessCount, bestScore: entry.bestRank, totalScore: entry.bestRank, challengeSolved: entry.status === "WON",
      bestGuess: ended ? findItem(gameType, entry.guesses.find(guess => guess.rank === (entry.status === "WON" ? 0 : entry.bestRank))?.itemId || "")?.name : undefined,
      isMe: entry.userId === userId,
    }));
    const userIn = rows.find(row => row.isMe);
    const target = ended ? findItem(geoRaceType(challenge.gameType), challenge.targetId)?.name ?? null : null;
    return { rows: rows.slice(0, 50), me: userIn || null, challenge: { ...countryChallengeTimes(challenge.startsAt, now, challenge.endsAt), id: challenge.id, gameType, ended, target }, challenges: (await tx.countryChallenge.findMany({ where: { gameType }, orderBy: { startsAt: "desc" }, take: 30 })).map(c => ({ ...countryChallengeTimes(c.startsAt, now, c.endsAt), id: c.id, gameType, ended: now >= c.endsAt, target: now >= c.endsAt ? findItem(gameType, c.targetId)?.name ?? null : null })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
