import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { advanceWordWeaverWritingRound } from "./word-weaver-round";
import { pumpWordWeaverBots, waitForWordWeaverBots } from "./word-weaver-bots";
import { selectWordWeaverWinners } from "./word-weaver-personas";
import { judgeWordWeaverEntry } from "./word-weaver-judge";
import {
  WORD_WEAVER_MODEL,
  WORD_WEAVER_PRESENCE_MS,
  WORD_WEAVER_RESULTS_MS,
  WORD_WEAVER_RUBRIC_VERSION,
  WORD_WEAVER_WRITE_MS,
} from "./word-weaver-core";
import { chooseWordWeaverMissions } from "./word-weaver-missions";

const roomId = "public";
const workerId = crypto.randomUUID();
const leaseMs = 30_000;
const pollMs = 750;
const concurrency = 8;


async function getLease() {
  const now = new Date();
  await prisma.wordWeaverRoom.upsert({ where: { id: roomId }, create: { id: roomId }, update: {} });
  const claimed = await prisma.wordWeaverRoom.updateMany({
    where: { id: roomId, OR: [{ workerLeaseUntil: null }, { workerLeaseUntil: { lt: now } }, { workerLeaseOwner: workerId }] },
    data: { workerLeaseOwner: workerId, workerLeaseUntil: new Date(now.getTime() + leaseMs) },
  });
  return claimed.count === 1;
}

async function activePlayerCount(now: Date) {
  const cutoff = new Date(now.getTime() - WORD_WEAVER_PRESENCE_MS);
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "userId") AS "count" FROM "WordWeaverPresence" WHERE "lastSeenAt" >= ${cutoff}`;
  return Number(rows[0]?.count || 0);
}

async function makeRound() {
  const now = new Date();
  const users = await activePlayerCount(now);
  if (!users) return;
  const previousRounds = await prisma.wordWeaverRound.findMany({ where: { missionId: { not: null } }, orderBy: { number: "desc" }, take: 20, select: { missionId: true } });
  const recentMissionIds = previousRounds.flatMap((item) => item.missionId ? [item.missionId] : []);
  const current = await prisma.wordWeaverRoom.findUnique({ where: { id: roomId } });
  const currentRoundId = current?.currentRoundId;
  const currentRound = currentRoundId
    ? await prisma.wordWeaverRound.findUnique({ where: { id: currentRoundId }, select: { id: true } })
    : null;
  const mission = chooseWordWeaverMissions(recentMissionIds, crypto.randomInt, 1)[0];
  const round = await prisma.wordWeaverRound.create({
    data: {
      word: mission.prompt,
      missionId: mission.id,
      missionType: mission.type,
      startedAt: now,
      writeDeadline: new Date(now.getTime() + WORD_WEAVER_WRITE_MS),
      judgeModel: process.env.JEV_MODEL || WORD_WEAVER_MODEL,
      rubricVersion: WORD_WEAVER_RUBRIC_VERSION,
    },
  });
  await prisma.wordWeaverRoom.update({ where: { id: roomId }, data: { currentRoundId: round.id } });
  if (currentRound) await prisma.wordWeaverRound.updateMany({ where: { id: currentRound.id, status: "RESULTS" }, data: { status: "CLOSED" } });
}

async function judgePendingEntries(roundId: string) {
  const entries = await prisma.wordWeaverEntry.findMany({
    where: { roundId, status: "PENDING" },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: concurrency,
    include: { round: { select: { word: true, missionId: true, missionType: true, judgeModel: true } } },
  });
  if (entries.length) await Promise.all(entries.map(judgeWordWeaverEntry));
}

async function finishJudging(roundId: string) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "WordWeaverRound" WHERE "id" = ${roundId} FOR UPDATE`;
    const round = await tx.wordWeaverRound.findUnique({ where: { id: roundId } });
    if (!round || round.status !== "JUDGING") return;
    const pending = await tx.wordWeaverEntry.count({ where: { roundId, status: "PENDING" } });
    if (pending) return;
    const scores = await tx.wordWeaverEntry.findMany({ where: { roundId, status: "SCORED", finalScore: { not: null } }, select: { id: true, userId: true, finalScore: true } });
    const { winner } = selectWordWeaverWinners(scores, crypto.randomInt);
    await tx.wordWeaverRound.update({ where: { id: roundId }, data: { status: "RESULTS", resolvedAt: now, revealUntil: new Date(now.getTime() + WORD_WEAVER_RESULTS_MS), winnerUserId: winner?.userId || null, winningEntryId: winner?.id || null, nextWordPickerUserId: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function tick() {
  if (!await getLease()) return;
  try {
    const now = new Date();
    const room = await prisma.wordWeaverRoom.findUnique({ where: { id: roomId } });
    if (!room) return;
    const players = await activePlayerCount(now);
    if (!room.currentRoundId) {
      if (players) await makeRound();
      return;
    }
    const round = await prisma.wordWeaverRound.findUnique({ where: { id: room.currentRoundId } });
    if (!round) {
      await prisma.wordWeaverRoom.update({ where: { id: roomId }, data: { currentRoundId: null } });
      return;
    }
    if (round.status === "WRITING") {
      if (players) await pumpWordWeaverBots(round);
      await advanceWordWeaverWritingRound(round.id);
      return;
    }
    if (round.status === "JUDGING") {
      await judgePendingEntries(round.id);
      await finishJudging(round.id);
      return;
    }
    if (round.status === "RESULTS" && round.revealUntil && round.revealUntil <= now) {
      if (!players) {
        await prisma.$transaction([
          prisma.wordWeaverRound.update({ where: { id: round.id }, data: { status: "CLOSED" } }),
          prisma.wordWeaverRoom.updateMany({ where: { id: roomId, currentRoundId: round.id }, data: { currentRoundId: null } }),
        ]);
      } else {
        await makeRound();
      }
    }
  } finally {
    await prisma.wordWeaverRoom.updateMany({ where: { id: roomId, workerLeaseOwner: workerId }, data: { workerLeaseOwner: null, workerLeaseUntil: null } });
  }
}

export async function runWordWeaverWorker(signal: AbortSignal) {
  console.log("word-weaver worker started", workerId);
  try {
    while (!signal.aborted) {
      try { await tick(); }
      catch (error) { console.error("word-weaver worker tick failed", error); }
      if (signal.aborted) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, pollMs);
        function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    }
  } finally {
    await waitForWordWeaverBots();
  }
}
