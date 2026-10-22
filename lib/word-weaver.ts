import { Prisma } from "@prisma/client";
import { wordWeaverActor } from "./word-weaver-personas";
import { prisma } from "./prisma";
import { WORD_WEAVER_PRESENCE_MS, validateWordWeaverNextWord, validateWordWeaverText } from "./word-weaver-core";
import { getWordWeaverMission } from "./word-weaver-missions";

const ROOM_ID = "public";
const activeSince = () => new Date(Date.now() - WORD_WEAVER_PRESENCE_MS);

async function activePlayersCount() {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "userId") AS "count" FROM "WordWeaverPresence" WHERE "lastSeenAt" >= ${activeSince()}`;
  return Number(rows[0]?.count || 0);
}

export async function ensureWordWeaverRoom() {
  return prisma.wordWeaverRoom.upsert({ where: { id: ROOM_ID }, create: { id: ROOM_ID }, update: {} });
}

async function touchPresence(userId: string, clientId: string) {
  await prisma.wordWeaverPresence.upsert({
    where: { userId_clientId: { userId, clientId } },
    create: { userId, clientId, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  });
  await ensureWordWeaverRoom();
}

export async function getWordWeaverState(userId: string) {
  const room = await ensureWordWeaverRoom();
  const [round, playersCount, user] = await Promise.all([
    room.currentRoundId ? prisma.wordWeaverRound.findUnique({ where: { id: room.currentRoundId } }) : null,
    activePlayersCount(),
    prisma.user.findUnique({ where: { id: userId }, select: { wordWeaverOnboardedAt: true } }),
  ]);
  const [mine, submittedEntries] = round ? await Promise.all([
    prisma.wordWeaverEntry.findUnique({ where: { roundId_userId: { roundId: round.id, userId } }, select: { text: true, status: true } }),
    ["WRITING", "JUDGING"].includes(round.status)
      ? prisma.wordWeaverEntry.findMany({ where: { roundId: round.id }, orderBy: [{ submittedAt: "asc" }, { id: "asc" }], select: { id: true, text: true, botPersonaId: true, user: { select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } } } })
      : [],
  ]) : [null, []];
  const mission = round ? getWordWeaverMission(round.missionId) : null;
  const visibleResult = round?.status === "RESULTS" ? round : null;
  let winner = null;
  if (visibleResult?.winningEntryId) {
    const entry = await prisma.wordWeaverEntry.findUnique({ where: { id: visibleResult.winningEntryId }, include: { user: { select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } } } });
    if (entry) winner = wordWeaverActor(entry);
  }
  let judgedCount = 0;
  let entryCount = 0;
  if (round && (round.status === "JUDGING" || round.status === "RESULTS")) {
    [judgedCount, entryCount] = await Promise.all([
      prisma.wordWeaverEntry.count({ where: { roundId: round.id, status: { in: ["SCORED", "FAILED"] } } }),
      prisma.wordWeaverEntry.count({ where: { roundId: round.id } }),
    ]);
  } else if (round?.status === "WRITING") {
    entryCount = await prisma.wordWeaverEntry.count({ where: { roundId: round.id } });
  }
  return {
    serverNow: new Date().toISOString(),
    onboardingRequired: !user?.wordWeaverOnboardedAt,
    playersCount,
    round: round ? {
      id: round.id,
      number: round.number,
      status: round.status,
      word: round.word,
      missionId: round.missionId,
      missionType: round.missionType,
      missionTitle: mission?.typeLabel || "تمرین نوشتن",
      missionPrompt: mission?.prompt || round.word,
      missionHint: mission?.hint || "کوتاه و خلاقانه پاسخ بده.",
      writeDeadline: round.writeDeadline.toISOString(),
      revealUntil: round.revealUntil?.toISOString() || null,
      entryCount,
      judgedCount,
      isSolo: round.isSolo,
      myEntry: mine,
      submittedEntries: submittedEntries.map((entry) => ({ id: entry.id, text: entry.text, user: wordWeaverActor(entry) })),
    } : null,
    latestResult: visibleResult ? {
      id: visibleResult.id,
      number: visibleResult.number,
      word: visibleResult.word,
      missionId: visibleResult.missionId,
      missionType: visibleResult.missionType,
      missionTitle: getWordWeaverMission(visibleResult.missionId)?.typeLabel || "تمرین نوشتن",
      missionPrompt: getWordWeaverMission(visibleResult.missionId)?.prompt || visibleResult.word,
      winner,
    } : null,
  };
}

export async function joinWordWeaver(userId: string, clientId: string) {
  await touchPresence(userId, clientId);
  return getWordWeaverState(userId);
}

export async function heartbeatWordWeaver(userId: string, clientId: string) {
  await touchPresence(userId, clientId);
  return getWordWeaverState(userId);
}

export async function leaveWordWeaver(userId: string, clientId: string) {
  await prisma.wordWeaverPresence.deleteMany({ where: { userId, clientId } });
}

export async function submitWordWeaverEntry(userId: string, rawText: unknown) {
  if (typeof rawText !== "string") throw new Error("ENTRY_INVALID");
  const parsed = validateWordWeaverText(rawText);
  if (!parsed.valid) throw new Error("ENTRY_INVALID");
  const room = await ensureWordWeaverRoom();
  if (!room.currentRoundId) throw new Error("ROUND_NOT_WRITING");
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "WordWeaverRound" WHERE "id" = ${room.currentRoundId} FOR UPDATE`;
      const now = new Date();
      const round = await tx.wordWeaverRound.findUnique({ where: { id: room.currentRoundId! } });
      if (!round || round.status !== "WRITING" || round.writeDeadline <= now) throw new Error("ROUND_NOT_WRITING");
      const presence = await tx.wordWeaverPresence.findFirst({ where: { userId, lastSeenAt: { gte: new Date(now.getTime() - WORD_WEAVER_PRESENCE_MS) } } });
      if (!presence) throw new Error("PLAYER_NOT_PRESENT");
      const existing = await tx.wordWeaverEntry.findUnique({
        where: { roundId_userId: { roundId: round.id, userId } },
        select: { text: true, status: true, submittedAt: true },
      });
      if (existing) {
        if (existing.text !== parsed.text) throw new Error("ENTRY_ALREADY_SUBMITTED");
        return existing;
      }
      return tx.wordWeaverEntry.create({
        data: { roundId: round.id, userId, text: parsed.text },
        select: { text: true, status: true, submittedAt: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("ROUND_") || ["PLAYER_NOT_PRESENT", "ENTRY_ALREADY_SUBMITTED"].includes(error.message))) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new Error("ROUND_NOT_WRITING");
    throw error;
  }
}

export async function chooseWordWeaverNextWord(userId: string, rawWord: unknown) {
  if (typeof rawWord !== "string") throw new Error("NEXT_WORD_INVALID");
  const room = await ensureWordWeaverRoom();
  if (!room.currentRoundId) throw new Error("PICK_NOT_ALLOWED");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "WordWeaverRound" WHERE "id" = ${room.currentRoundId} FOR UPDATE`;
    const now = new Date();
    const round = await tx.wordWeaverRound.findUnique({ where: { id: room.currentRoundId! } });
    if (!round || round.status !== "RESULTS" || round.nextWordPickerUserId !== userId || !round.revealUntil || round.revealUntil <= now) throw new Error("PICK_NOT_ALLOWED");
    const presence = await tx.wordWeaverPresence.findFirst({ where: { userId, lastSeenAt: { gte: new Date(now.getTime() - WORD_WEAVER_PRESENCE_MS) } } });
    if (!presence) throw new Error("PLAYER_NOT_PRESENT");
    const parsed = validateWordWeaverNextWord(rawWord, round.word);
    if (!parsed.valid) throw new Error("NEXT_WORD_INVALID");
    const changed = await tx.wordWeaverRound.updateMany({ where: { id: round.id, status: "RESULTS", nextWord: null, revealUntil: { gt: now } }, data: { nextWord: parsed.word } });
    if (!changed.count) throw new Error("PICK_ALREADY_SET");
    return parsed.word;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getWordWeaverResults(roundId: unknown, userId: string) {
  if (typeof roundId !== "string" || !roundId || roundId.length > 64) throw new Error("RESULT_NOT_READY");
  const round = await prisma.wordWeaverRound.findFirst({ where: { id: roundId, status: { in: ["RESULTS", "CLOSED"] }, resolvedAt: { not: null } }, select: { id: true, winnerUserId: true, winningEntryId: true } });
  if (!round) throw new Error("RESULT_NOT_READY");
  const include = { user: { select: { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } } } as const;
  const [leaders, mine, winner] = await Promise.all([
    prisma.wordWeaverEntry.findMany({
      where: { roundId: round.id, status: "SCORED", finalScore: { not: null }, ...(round.winningEntryId ? { id: { not: round.winningEntryId } } : {}) },
      orderBy: [{ finalScore: "desc" }, { id: "asc" }], take: round.winningEntryId ? 2 : 3, include,
    }),
    prisma.wordWeaverEntry.findUnique({ where: { roundId_userId: { roundId: round.id, userId } }, include }),
    round.winningEntryId ? prisma.wordWeaverEntry.findUnique({ where: { id: round.winningEntryId }, include }) : null,
  ]);
  const top = winner ? [winner, ...leaders] : leaders;
  const entries = mine && !top.some((entry) => entry.id === mine.id) ? [...top, mine] : top;
  return {
    results: await Promise.all(entries.map(async (entry) => ({
      id: entry.id, text: entry.text, status: entry.status, failureMessage: entry.failureMessage,
      relevanceScore: entry.relevanceScore, originalityScore: entry.originalityScore, expressionScore: entry.expressionScore,
      feedback: entry.userId === userId ? entry.feedback : null,
      score: entry.finalScore === null ? null : entry.finalScore / 100,
      // Equal scores share a rank; the persisted random winner is shown first.
      rank: entry.finalScore === null ? null : 1 + await prisma.wordWeaverEntry.count({ where: { roundId: round.id, status: "SCORED", finalScore: { gt: entry.finalScore } } }),
      isWinner: entry.id === round.winningEntryId, isMe: entry.userId === userId,
      user: wordWeaverActor(entry),
    }))),
    winnerUserId: round.winnerUserId,
  };
}
