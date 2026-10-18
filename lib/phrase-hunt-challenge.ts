import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { phraseHuntTargets } from "./data/phrase-hunt-targets";
import { PHRASE_HUNT_JUDGE_MODEL, PHRASE_HUNT_JUDGE_VERSION } from "./phrase-hunt-judge";
import { phraseChallengeWindow } from "./phrase-hunt-schedule";

export async function currentPhraseChallenge(now = new Date()) {
  const window = phraseChallengeWindow(now);
  const existing = await prisma.phraseHuntChallenge.findUnique({ where: { id: window.id } });
  if (existing) return existing;
  const recent = await prisma.phraseHuntChallenge.findMany({
    where: { startsAt: { lt: window.startsAt } }, orderBy: { startsAt: "desc" },
    take: phraseHuntTargets.length - 1, select: { targetId: true },
  });
  const seen = new Set(recent.map(item => item.targetId));
  const pool = phraseHuntTargets.filter(target => !seen.has(target.id));
  const target = pool[randomInt(pool.length)];
  try {
    return await prisma.phraseHuntChallenge.upsert({
      where: { id: window.id },
      create: { ...window, targetId: target.id, judgeVersion: PHRASE_HUNT_JUDGE_VERSION, judgeModel: PHRASE_HUNT_JUDGE_MODEL }, update: {},
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.phraseHuntChallenge.findUniqueOrThrow({ where: { id: window.id } });
  }
}

export async function currentPhraseGame(userId: string) {
  const challenge = await currentPhraseChallenge();
  await prisma.gameSession.updateMany({
    where: { userId, type: "PHRASE_HUNT", status: "ACTIVE", OR: [
      { phraseChallengeId: null }, { phraseChallengeId: { lt: challenge.id } },
    ] },
    data: { status: "SURRENDERED", finishedAt: new Date() },
  });
  const where = { userId_phraseChallengeId: { userId, phraseChallengeId: challenge.id } };
  const include = { guesses: true, phraseGuesses: { orderBy: { createdAt: "asc" as const } } };
  try {
    return await prisma.gameSession.upsert({
      where, update: {}, include,
      create: { userId, type: "PHRASE_HUNT", targetId: challenge.targetId, phraseChallengeId: challenge.id, datasetVersion: "2026-10-16-phrase-hunt-daily-v1" },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.gameSession.findUniqueOrThrow({ where, include });
  }
}
