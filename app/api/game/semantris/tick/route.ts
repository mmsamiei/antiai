import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGame } from "@/lib/game-service";
import { applySemantrisTick, readSemantrisState } from "@/lib/semantris";

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const { gameId } = await request.json().catch(() => ({}));
  if (typeof gameId !== "string") return NextResponse.json({ error: "بازی معتبر نیست" }, { status: 400 });
  const game = await prisma.gameSession.findFirst({ where: { id: gameId, userId, type: "SEMANTRIS", status: "ACTIVE" } });
  const state = game && readSemantrisState(game.semantrisState);
  if (!game || !state) return NextResponse.json({ error: "این بازی دیگر فعال نیست" }, { status: 409 });
  const next = applySemantrisTick(state);
  const updated = await prisma.gameSession.update({ where: { id: game.id }, data: { semantrisState: { words: next.words, targetWord: next.targetWord, score: next.score, cleared: next.cleared, moves: next.moves, combo: next.combo, gameOver: next.gameOver, lastDropAt: next.lastDropAt, wave: next.wave, clues: next.clues, usedClues: next.usedClues, pendingWords: next.pendingWords }, ...(next.gameOver ? { status: "SURRENDERED", finishedAt: new Date() } : {}) }, include: { guesses: true } });
  return NextResponse.json({ game: serializeGame(updated), added: next.added });
}
