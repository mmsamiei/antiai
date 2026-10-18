import type { GameSession, GameType, Guess } from "@prisma/client";
import { prisma } from "./prisma";
import { DATASET_VERSION, datasetFor, findItem, publicItem, normalizePersian } from "./geo";
import { wordPrompts, promptById } from "./data/adjective-prompts";
import { createSemantrisState, publicSemantrisState, readSemantrisState } from "./semantris";
import { currentPhraseGame } from "./phrase-hunt-challenge";
import { phraseChallengeTimes } from "./phrase-hunt-schedule";
import { phraseHuntTargets } from "./data/phrase-hunt-targets";

export const GAME_TYPES = ["IRAN_CITY", "COUNTRY", "PHRASE_HUNT", "SEMANTRIS", "LETTER_DUEL"] as const;

export function parseGameType(value: unknown): GameType | null {
  return typeof value === "string" && GAME_TYPES.includes(value as (typeof GAME_TYPES)[number])
    ? value as GameType
    : null;
}

export function isRetiredWordGame(type: GameType): boolean {
  return type === "ADJECTIVE" || type === "ADJECTIVE_RAIN";
}

export function parseLeaderboardGameType(value: unknown): GameType | null {
  if (value === "ADJECTIVE" || value === "ADJECTIVE_RAIN") return value;
  return parseGameType(value);
}

/** The stored rank keeps the geographic engine's original zero/one-based semantics. */
export function publicProximityRank(type: GameType, rank: number) {
  return (type === "COUNTRY" || type === "IRAN_CITY") && rank > 0 ? rank + 1 : rank;
}

export function canResumeActiveGame(type: GameType, targetId: string) {
  return type !== "IRAN_CITY" || Boolean(findItem(type, targetId));
}

export function serializeGame(game: GameSession & { guesses: Guess[]; phraseGuesses?: { id: string; phrase: string; score: number; createdAt: Date }[] }, revealTarget = false) {
  if (game.type === "PHRASE_HUNT") {
    const target = phraseHuntTargets.find((item) => item.id === game.targetId);
    return {
      id: game.id, type: game.type, status: game.status, guessesCount: game.guessesCount,
      totalItems: 100, startedAt: game.startedAt, finishedAt: game.finishedAt,
      challenge: game.phraseChallengeId ? phraseChallengeTimes(game.phraseChallengeId) : null,
      guesses: [],
      phraseGuesses: (game.phraseGuesses || []).map((guess) => ({ id: guess.id, name: guess.phrase, score: guess.score, createdAt: guess.createdAt })),
      bestScore: Math.max(0, ...(game.phraseGuesses || []).map((guess) => guess.score)),
      target: (revealTarget || game.status !== "ACTIVE") && target ? { id: target.id, name: target.phrase } : null,
    };
  }
  if (game.type === "SEMANTRIS") {
    const state = readSemantrisState(game.semantrisState) || createSemantrisState();
    return { id: game.id, type: game.type, status: game.status, guessesCount: game.guessesCount, totalItems: 10, startedAt: game.startedAt, finishedAt: game.finishedAt, guesses: [], target: null, semantris: publicSemantrisState(state) };
  }
  if (game.type === "ADJECTIVE_RAIN") {
    const prompt = promptById(game.targetId);
    const acceptedCount = game.guesses.filter((guess) => guess.rank > 0).length;
    return {
      id: game.id, type: game.type, status: game.status, guessesCount: game.guessesCount, totalItems: 3,
      startedAt: game.startedAt, finishedAt: game.finishedAt,
      prompt: prompt ? { id: prompt.id, name: prompt.name, emoji: prompt.emoji, partOfSpeech: prompt.partOfSpeech || "صفت", examples: revealTarget ? prompt.examples : [] } : null,
      acceptedCount,
      guesses: game.guesses.map((guess) => ({ id: guess.itemId, name: guess.itemId, rank: guess.rank, createdAt: guess.createdAt })),
      target: null
    };
  }
  const dataset = datasetFor(game.type);
  const guesses = game.guesses.map((guess) => {
    const item = findItem(game.type, guess.itemId);
    return item ? { ...publicItem(item), rank: publicProximityRank(game.type, guess.rank), createdAt: guess.createdAt } : null;
  }).filter(Boolean);
  const target = revealTarget ? findItem(game.type, game.targetId) : undefined;
  return {
    id: game.id,
    type: game.type,
    status: game.status,
    guessesCount: game.guessesCount,
    totalItems: dataset.length,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt,
    guesses,
    target: target ? publicItem(target, revealTarget) : null
  };
}

export async function activeOrNewGame(userId: string, type: GameType) {
  if (isRetiredWordGame(type)) throw new Error("GAME_RETIRED");
  if (type === "PHRASE_HUNT") return currentPhraseGame(userId);
  const active = await prisma.gameSession.findFirst({
    where: { userId, type, status: "ACTIVE" },
    include: { guesses: { orderBy: { createdAt: "asc" } }, phraseGuesses: { orderBy: { createdAt: "asc" } } },
    orderBy: { startedAt: "desc" }
  });
  if (active && canResumeActiveGame(type, active.targetId)) return active;
  if (active) {
    await prisma.gameSession.updateMany({
      where: { id: active.id, userId, status: "ACTIVE" },
      data: { status: "SURRENDERED", finishedAt: new Date() }
    });
  }
  if (type === "SEMANTRIS") {
    const state = createSemantrisState();
    return prisma.gameSession.create({ data: { userId, type, targetId: "semantris-v1", datasetVersion: "2026-10-02-semantris-v1", semantrisState: state }, include: { guesses: true } });
  }
  if (type === "ADJECTIVE_RAIN") {
    const previous = await prisma.gameSession.findMany({ where: { userId, type }, select: { targetId: true }, distinct: ["targetId"] });
    const seen = new Set(previous.map((game) => game.targetId));
    const pool = wordPrompts.filter((prompt) => !seen.has(prompt.id));
    const prompt = (pool.length ? pool : wordPrompts)[Math.floor(Math.random() * (pool.length || wordPrompts.length))];
    return prisma.gameSession.create({ data: { userId, type, targetId: prompt.id, datasetVersion: "2026-10-02-adjective-rain-v1" }, include: { guesses: true } });
  }

  const previous = await prisma.gameSession.findMany({
    where: { userId, type }, select: { targetId: true }, distinct: ["targetId"]
  });
  const seen = new Set(previous.map((game) => game.targetId));
  const dataset = datasetFor(type);
  const unseen = dataset.filter((item) => !seen.has(item.id));
  const pool = unseen.length ? unseen : dataset;
  const target = pool[Math.floor(Math.random() * pool.length)];
  return prisma.gameSession.create({
    data: { userId, type, targetId: target.id, datasetVersion: DATASET_VERSION },
    include: { guesses: true }
  });
}
