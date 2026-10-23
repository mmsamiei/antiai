import { measureJudge } from "@/lib/judge-metrics";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGame } from "@/lib/game-service";
import { phraseHuntTarget, isPhraseHuntAnswer } from "@/lib/phrase-hunt-answer";
import { judgePhrase, normalizePhraseGuess } from "@/lib/phrase-hunt-judge";
import { isCurrentPhraseChallenge } from "@/lib/phrase-hunt-schedule";
import { phraseHuntTransaction } from "@/lib/phrase-hunt-transaction";
import { readPhraseHuntGuessState } from "@/lib/phrase-hunt-guess-state";

const PHRASE_HUNT_GUESSES_PER_MINUTE = 30;

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("gameId" in body) || !("phrase" in body) || typeof body.gameId !== "string" || typeof body.phrase !== "string") return NextResponse.json({ error: "حدس معتبر نیست" }, { status: 400 });
  const input = body as { gameId: string; phrase: string; responseMode?: unknown };
  // Older open clients still receive their full snapshot until they refresh.
  const delta = input.responseMode === "delta";

  try {
    const phrase = normalizePhraseGuess(input.phrase);
    if (!phrase || phrase.length > 120 || phrase.split(" ").length > 12) throw new Error("PHRASE_INVALID");
    const game = await readPhraseHuntGuessState(prisma, input.gameId, userId, phrase);
    if (!game) throw new Error("GAME_NOT_ACTIVE");
    if (!isCurrentPhraseChallenge(game.phraseChallengeId)) throw new Error("CHALLENGE_ENDED");
    if (game.duplicate) throw new Error("GUESS_REPEATED");
    if (game.recentCount >= PHRASE_HUNT_GUESSES_PER_MINUTE) throw new Error("RATE_LIMITED");
    const target = phraseHuntTarget(game.targetId);
    if (!target) throw new Error("TARGET_INVALID");
    const won = isPhraseHuntAnswer(target, phrase);
    const score = won ? 100 : (game.phraseChallenge!.judgeVersion >= 6
      ? await judgePhrase(target.id, target.phrase, phrase, game.phraseChallenge!.judgeVersion, game.phraseChallenge!.judgeModel, { challengeId: game.phraseChallengeId!, userId })
      : await judgePhrase(target.id, target.phrase, phrase, game.phraseChallenge!.judgeVersion, game.phraseChallenge!.judgeModel));

    const result = await measureJudge("guess_commit", () => phraseHuntTransaction(userId, async (tx) => {
      const current = await readPhraseHuntGuessState(tx, game.id, userId, phrase);
      if (!current) throw new Error("GAME_NOT_ACTIVE");
      if (!isCurrentPhraseChallenge(current.phraseChallengeId)) throw new Error("CHALLENGE_ENDED");
      if (current.duplicate) throw new Error("GUESS_REPEATED");
      if (current.recentCount >= PHRASE_HUNT_GUESSES_PER_MINUTE) throw new Error("RATE_LIMITED");
      const guess = await tx.phraseHuntGuess.create({ data: { gameId: game.id, phrase: input.phrase.trim(), normalized: phrase, score } });
      const update = {
        where: { id: game.id },
        data: { guessesCount: { increment: 1 }, ...(won ? { status: "WON" as const, finishedAt: new Date() } : {}) },
      };
      const updated = delta
        ? { ...await tx.gameSession.update(update), guesses: [] }
        : await tx.gameSession.update({ ...update, include: { guesses: true, phraseGuesses: { orderBy: { createdAt: "asc" } } } });
      return { game: updated, guess };
    }));
    const snapshot = serializeGame({ ...result.game, guesses: result.game.guesses ?? [] }, won);
    if (delta) {
      const { phraseGuesses: _history, bestScore: _best, ...state } = snapshot;
      return NextResponse.json({ game: state, guess: { id: result.guess.id, name: result.guess.phrase, score: result.guess.score, createdAt: result.guess.createdAt }, score, won });
    }
    return NextResponse.json({ game: snapshot, score, won });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "این عبارت را قبلاً حدس زده‌ای" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "وضعیت بازی تغییر کرد؛ دوباره تلاش کن." }, { status: 409 });
    const message = error instanceof Error ? error.message : "";
    if (message === "CHALLENGE_ENDED") return NextResponse.json({ error: "این چالش تمام شده؛ چالش تازه را باز کن." }, { status: 409 });
    if (message === "GAME_NOT_ACTIVE") return NextResponse.json({ error: "این بازی دیگر فعال نیست" }, { status: 409 });
    if (message === "GUESS_REPEATED") return NextResponse.json({ error: "این عبارت را قبلاً حدس زده‌ای" }, { status: 409 });
    if (message === "RATE_LIMITED") return NextResponse.json({ error: "کمی آهسته‌تر حدس بزن و دوباره تلاش کن." }, { status: 429 });
    if (message === "PHRASE_INVALID") return NextResponse.json({ error: "عبارت باید حداکثر ۱۲ واژه و ۱۲۰ نویسه باشد." }, { status: 400 });
    if (message === "JEV_BUSY") return NextResponse.json({ error: "داور مشغول بررسی حدس‌هاست؛ چند لحظهٔ دیگر دوباره تلاش کن." }, { status: 429, headers: { "Retry-After": "2" } });
    if (message === "JEV_UNAVAILABLE") return NextResponse.json({ error: "داور هوشمند موقتاً در دسترس نیست؛ دوباره تلاش کن." }, { status: 503 });
    return NextResponse.json({ error: "ثبت حدس انجام نشد" }, { status: 500 });
  }
}
