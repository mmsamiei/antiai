import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { chooseDuelLetter, createPrivateDuel, heartbeatDuel, joinPrivateDuel, joinRandomDuel, leaveDuel, rematchDuel, serializeDuel, submitDuelWord } from "@/lib/letter-duel";
import { cancelCountryMatch } from "@/lib/country-matchmaking";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) { const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401); const id = new URL(request.url).searchParams.get("id"); return reply({ duel: await serializeDuel(userId, id) }); }
export async function POST(request: Request) {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401);
  const body = await request.json().catch(() => ({})); const action = body.action;
  try {
    let room;
    if (action === "create-private") room = await createPrivateDuel(userId);
    else if (action === "join-private" && typeof body.token === "string") room = await joinPrivateDuel(userId, body.token);
    else if (action === "join-random") room = await joinRandomDuel(userId);
    else if ((action === "rematch" || action === "cancel-rematch") && typeof body.connectionId === "string") room = await rematchDuel(userId, body.connectionId, action === "cancel-rematch");
    else if (action === "heartbeat" && typeof body.connectionId === "string") await heartbeatDuel(userId, body.connectionId);
    else if (action === "choose-letter" && typeof body.connectionId === "string" && typeof body.letter === "string") await chooseDuelLetter(userId, body.connectionId, body.letter);
    else if (action === "submit-word" && typeof body.connectionId === "string" && typeof body.word === "string") { const verdict = await submitDuelWord(userId, body.connectionId, body.word); return reply({ duel: await serializeDuel(userId, body.connectionId), verdict }); }
    else if (action === "leave" && typeof body.connectionId === "string") { await leaveDuel(userId, body.connectionId); return reply({ duel: null }); }
    else return reply({ error: "درخواست معتبر نیست" }, 400);
    if (["create-private", "join-private", "join-random", "rematch"].includes(action)) await cancelCountryMatch(userId);
    return reply({ duel: await serializeDuel(userId, room?.id || body.connectionId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, [string, number]> = { REMATCH_UNAVAILABLE: ["بازی مجدد ممکن نیست؛ یکی از بازیکن‌ها وارد مسابقهٔ دیگری شده است", 409], ROOM_UNAVAILABLE: ["این اتاق دیگر در دسترس نیست", 409], SELF_JOIN: ["نمی‌توانی وارد اتاق خودت شوی", 409], CONNECTION_NOT_FOUND: ["اتصال بازی پیدا نشد", 404], LETTER_INVALID: ["یک حرف فارسی انتخاب کن", 400], ROUND_CHANGED: ["این مرحله تمام شده است", 409], JEV_UNAVAILABLE: ["داور هوشمند موقتاً در دسترس نیست؛ دوباره تلاش کن", 503] };
    const [message, status] = messages[code] || ["عملیات بازی انجام نشد", 500]; return reply({ error: message }, status);
  }
}
