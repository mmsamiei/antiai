import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { currentUserId } from "@/lib/auth";
import { findItem, proximityRank } from "@/lib/geo";
import { prisma } from "@/lib/prisma";
import { serializeGame } from "@/lib/game-service";
import { judgeAdjective } from "@/lib/adjective-judge";
import { applySemantrisMove, readSemantrisState, semantrisClueRejection, semantrisWords } from "@/lib/semantris";
import { judgeSemantris } from "@/lib/semantris-judge";

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const { gameId, itemId, word, clue } = await request.json().catch(() => ({}));
  if (typeof gameId !== "string") return NextResponse.json({ error: "حدس معتبر نیست" }, { status: 400 });
  try {
    if (typeof clue === "string") {
      const current = await prisma.gameSession.findFirst({ where: { id: gameId, userId, type: "SEMANTRIS", status: "ACTIVE" } });
      const state = current && readSemantrisState(current.semantrisState);
      if (!state) throw new Error("GAME_NOT_ACTIVE");
      const rejection = semantrisClueRejection(state, clue); if (rejection) throw new Error(rejection);
      const verdict = await judgeSemantris(clue, semantrisWords(state));
      if (verdict.fairness === "CHEATING") throw new Error("CLUE_CHEATING");
      const result = applySemantrisMove(state, verdict.clue, verdict.rankedWords);
      const updated = await prisma.gameSession.update({ where: { id: gameId }, data: { semantrisState: { words: result.words, targetWord: result.targetWord, score: result.score, cleared: result.cleared, moves: result.moves, combo: result.combo, gameOver: result.gameOver, lastDropAt: result.lastDropAt, wave: result.wave, clues: result.clues, usedClues: result.usedClues, pendingWords: result.pendingWords }, guessesCount: { increment: 1 }, ...(result.gameOver ? { status: "SURRENDERED", finishedAt: new Date() } : {}) }, include: { guesses: true } });
      return NextResponse.json({ game: serializeGame(updated), semantris: { hit: result.hit, removed: result.removed, targetRank: result.targetRank, rankedWords: verdict.rankedWords, targetWord: state.targetWord, removeStartIndex: result.removeStartIndex, removeEndIndex: result.removeEndIndex } });
    }
    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.gameSession.findFirst({ where: { id: gameId, userId, status: "ACTIVE" } });
      if (!game) throw new Error("GAME_NOT_ACTIVE");
      if (game.type === "ADJECTIVE_RAIN") {
        if (Date.now() - game.startedAt.getTime() >= 30_000) {
          const expired = await tx.gameSession.update({ where: { id: game.id }, data: { status: "SURRENDERED", finishedAt: new Date() }, include: { guesses: { orderBy: { createdAt: "asc" } } } });
          return { game: expired, rank: -1, won: false, expired: true };
        }
        if (typeof word !== "string") throw new Error("WORD_REQUIRED");
        const verdict = await judgeAdjective(game.targetId, word);
        const existingAccepted = await tx.guess.count({ where: { gameId: game.id, rank: { gt: 0 } } });
        await tx.guess.create({ data: { gameId: game.id, itemId: verdict.word, rank: verdict.quality } });
        const won = verdict.accepted && existingAccepted + 1 >= 3;
        const updated = await tx.gameSession.update({ where: { id: game.id }, data: { guessesCount: { increment: 1 }, ...(won ? { status: "WON", finishedAt: new Date() } : {}) }, include: { guesses: { orderBy: { createdAt: "asc" } } } });
        return { game: updated, rank: verdict.quality, won, verdict };
      }
      if (typeof itemId !== "string") throw new Error("ITEM_REQUIRED");
      const guessItem = findItem(game.type, itemId); const target = findItem(game.type, game.targetId);
      if (!guessItem || !target) throw new Error("ITEM_NOT_FOUND");
      const rank = proximityRank(game.type, guessItem, target);
      await tx.guess.create({ data: { gameId: game.id, itemId, rank } });
      const won = guessItem.id === target.id;
      const updated = await tx.gameSession.update({ where: { id: game.id }, data: { guessesCount: { increment: 1 }, ...(won ? { status: "WON", finishedAt: new Date() } : {}) }, include: { guesses: { orderBy: { createdAt: "asc" } } } });
      return { game: updated, rank, won };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ game: serializeGame(result.game, result.won), rank: result.rank, verdict: result.verdict, expired: result.expired || false });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "این گزینه را قبلاً حدس زده‌ای" }, { status: 409 });
    const message = error instanceof Error ? error.message : "";
    if (message === "GAME_NOT_ACTIVE") return NextResponse.json({ error: "این بازی دیگر فعال نیست" }, { status: 409 });
    if (message === "WORD_REQUIRED" || message === "ITEM_REQUIRED" || message === "CLUE_INVALID") return NextResponse.json({ error: "یک سرنخ کوتاه و فارسی بنویس" }, { status: 400 });
    if (message === "CLUE_ON_BOARD") return NextResponse.json({ error: "این واژه روی بورد است؛ یک سرنخ دیگر بنویس." }, { status: 409 });
    if (message === "CLUE_REPEATED") return NextResponse.json({ error: "این سرنخ را قبلاً استفاده کرده‌ای." }, { status: 409 });
    if (message === "CLUE_CHEATING") return NextResponse.json({ error: "این سرنخ شکل یا بخشی از یکی از واژه‌های بورد را لو می‌دهد؛ یک تداعی مستقل بنویس." }, { status: 422 });
    if (message === "NO_MATCH") return NextResponse.json({ error: "این سرنخ با هیچ واژه‌ای ارتباط روشنی نداشت" }, { status: 422 });
    if (message === "JEV_UNAVAILABLE") return NextResponse.json({ error: "داور هوشمند موقتاً در دسترس نیست" }, { status: 503 });
    if (message === "ITEM_NOT_FOUND") return NextResponse.json({ error: "گزینه پیدا نشد" }, { status: 404 });
    return NextResponse.json({ error: "ثبت حدس انجام نشد" }, { status: 500 });
  }
}
