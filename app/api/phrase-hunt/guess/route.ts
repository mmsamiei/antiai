import { measureJudge } from "@/lib/judge-metrics";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGame } from "@/lib/game-service";
import { phraseHuntTargets } from "@/lib/data/phrase-hunt-targets";
import { judgePhrase, normalizePhraseGuess } from "@/lib/phrase-hunt-judge";
import { isCurrentPhraseChallenge, phraseChallengeWindow } from "@/lib/phrase-hunt-schedule";
import { normalizePersian } from "@/lib/geo";

const PHRASE_HUNT_GUESSES_PER_MINUTE = 30;

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("gameId" in body) || !("phrase" in body) || typeof body.gameId !== "string" || typeof body.phrase !== "string") return NextResponse.json({ error: "حدس معتبر نیست" }, { status: 400 });
  const input = body as { gameId: string; phrase: string };

  try {
    const phrase = normalizePhraseGuess(input.phrase);
    if (!phrase || phrase.length > 120 || phrase.split(" ").length > 12) throw new Error("PHRASE_INVALID");
    const game = await prisma.gameSession.findFirst({ where: { id: input.gameId, userId, type: "PHRASE_HUNT", status: "ACTIVE" }, include: { phraseChallenge: true, phraseGuesses: { orderBy: { createdAt: "asc" } } } });
    if (!game) throw new Error("GAME_NOT_ACTIVE");
    if (!isCurrentPhraseChallenge(game.phraseChallengeId)) throw new Error("CHALLENGE_ENDED");
    if (game.phraseGuesses.some((guess) => guess.normalized === phrase)) throw new Error("GUESS_REPEATED");
    const recentCount = await prisma.phraseHuntGuess.count({ where: { game: { userId }, createdAt: { gte: new Date(Date.now() - 60_000) } } });
    if (recentCount >= PHRASE_HUNT_GUESSES_PER_MINUTE) throw new Error("RATE_LIMITED");
    const target = phraseHuntTargets.find((item) => item.id === game.targetId);
    if (!target) throw new Error("TARGET_INVALID");
    const answers = [target.phrase, ...target.aliases].map(normalizePersian);
    const won = answers.includes(phrase);
    const score = won ? 100 : (game.phraseChallenge!.judgeVersion >= 6
      ? await judgePhrase(target.id, target.phrase, phrase, game.phraseChallenge!.judgeVersion, game.phraseChallenge!.judgeModel, { challengeId: game.phraseChallengeId!, userId })
      : await judgePhrase(target.id, target.phrase, phrase, game.phraseChallenge!.judgeVersion, game.phraseChallenge!.judgeModel));

    const result = await measureJudge("guess_commit", () => prisma.$transaction(async (tx) => {
      const current = await tx.gameSession.findFirst({ where: { id: game.id, userId, type: "PHRASE_HUNT", status: "ACTIVE", phraseChallengeId: phraseChallengeWindow().id } });
      if (!current) throw new Error("GAME_NOT_ACTIVE");
      const [duplicate, userRecentCount] = await Promise.all([
        tx.phraseHuntGuess.findUnique({ where: { gameId_normalized: { gameId: game.id, normalized: phrase } } }),
        tx.phraseHuntGuess.count({ where: { game: { userId }, createdAt: { gte: new Date(Date.now() - 60_000) } } }),
      ]);
      if (!isCurrentPhraseChallenge(current.phraseChallengeId)) throw new Error("CHALLENGE_ENDED");
      if (duplicate) throw new Error("GUESS_REPEATED");
      if (userRecentCount >= PHRASE_HUNT_GUESSES_PER_MINUTE) throw new Error("RATE_LIMITED");
      await tx.phraseHuntGuess.create({ data: { gameId: game.id, phrase: input.phrase.trim(), normalized: phrase, score } });
      return tx.gameSession.update({
        where: { id: game.id },
        data: { guessesCount: { increment: 1 }, ...(won ? { status: "WON", finishedAt: new Date() } : {}) },
        include: { guesses: true, phraseGuesses: { orderBy: { createdAt: "asc" } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    return NextResponse.json({ game: serializeGame(result, won), score, won });
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
