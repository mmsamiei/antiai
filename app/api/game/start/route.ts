import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { activeOrNewGame, parseGameType, serializeGame } from "@/lib/game-service";

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const type = parseGameType(body.type);
  if (!type) return NextResponse.json({ error: "نوع بازی معتبر نیست" }, { status: 400 });
  const game = await activeOrNewGame(userId, type);
  return NextResponse.json({ game: serializeGame(game) });
}
