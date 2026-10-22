import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activeOrNewGame, parseGameType, serializeGame } from "@/lib/game-service";
import { cancelMatchingForUser } from "@/lib/country-matchmaking";

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const type = parseGameType(body.type);
  if (!type || type === "LETTER_DUEL") return NextResponse.json({ error: "نوع بازی معتبر نیست" }, { status: 400 });
  const game = await activeOrNewGame(userId, type);
  await prisma.$transaction(tx => cancelMatchingForUser(tx, userId, "وارد بازی دیگری شدی"));
  const user = type === "PHRASE_HUNT" ? await prisma.user.findUnique({ where: { id: userId }, select: { phraseHuntOnboardedAt: true } }) : null;
  return NextResponse.json({ game: serializeGame(game), ...(type === "PHRASE_HUNT" ? { onboardingRequired: !user?.phraseHuntOnboardedAt } : {}) });
}
