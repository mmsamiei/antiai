import type { GameSession, GameType, Guess } from "@prisma/client";
import { prisma } from "./prisma";
import { DATASET_VERSION, datasetFor, findItem, publicItem } from "./geo";
import { adjectivePrompts, promptById } from "./data/adjective-prompts";

export const GAME_TYPES = ["IRAN_CITY", "COUNTRY", "ADJECTIVE", "ADJECTIVE_RAIN"] as const;

export function parseGameType(value: unknown): GameType | null {
  return typeof value === "string" && GAME_TYPES.includes(value as (typeof GAME_TYPES)[number])
    ? value as GameType
    : null;
}

export function serializeGame(game: GameSession & { guesses: Guess[] }, revealTarget = false) {
  if (game.type === "ADJECTIVE_RAIN") {
    const prompt = promptById(game.targetId);
    const acceptedCount = game.guesses.filter((guess) => guess.rank > 0).length;
    return {
      id: game.id, type: game.type, status: game.status, guessesCount: game.guessesCount, totalItems: 5,
      startedAt: game.startedAt, finishedAt: game.finishedAt,
      prompt: prompt ? { id: prompt.id, name: prompt.name, emoji: prompt.emoji, examples: revealTarget ? prompt.examples : [] } : null,
      acceptedCount,
      guesses: game.guesses.map((guess) => ({ id: guess.itemId, name: guess.itemId, rank: guess.rank, createdAt: guess.createdAt })),
      target: null
    };
  }
  const dataset = datasetFor(game.type);
  const guesses = game.guesses.map((guess) => {
    const item = findItem(game.type, guess.itemId);
    return item ? { ...publicItem(item), rank: guess.rank, createdAt: guess.createdAt } : null;
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
    target: target ? publicItem(target) : null
  };
}

export async function activeOrNewGame(userId: string, type: GameType) {
  const active = await prisma.gameSession.findFirst({
    where: { userId, type, status: "ACTIVE" },
    include: { guesses: { orderBy: { createdAt: "asc" } } },
    orderBy: { startedAt: "desc" }
  });
  if (active) return active;
  if (type === "ADJECTIVE_RAIN") {
    const previous = await prisma.gameSession.findMany({ where: { userId, type }, select: { targetId: true }, distinct: ["targetId"] });
    const seen = new Set(previous.map((game) => game.targetId));
    const pool = adjectivePrompts.filter((prompt) => !seen.has(prompt.id));
    const prompt = (pool.length ? pool : adjectivePrompts)[Math.floor(Math.random() * (pool.length || adjectivePrompts.length))];
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
