import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { actOnInvite, InviteError, readInvites, sendInvite, setInvitePreference } from "@/lib/duel-invites";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9:_-]+$/);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), recipientId: id, gameKind: z.enum(["LETTER_DUEL", "COUNTRY_RACE", "CITY_RACE"]).optional() }),
  z.object({ action: z.enum(["accept", "reject", "cancel", "ready"]), id }),
  z.object({ action: z.literal("preference"), enabled: z.boolean() })
]);
export async function GET() {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد شو" }, 401);
  return reply(await readInvites(userId));
}
export async function POST(request: Request) {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد شو" }, 401);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "درخواست معتبر نیست" }, 400);
  try {
    const body = parsed.data;
    if (body.action === "send") await sendInvite(userId, body.recipientId, ...(body.gameKind ? [body.gameKind] as const : []));
    else if (body.action === "preference") await setInvitePreference(userId, body.enabled);
    else await actOnInvite(userId, body.id, body.action);
    return reply(await readInvites(userId));
  } catch (error) {
    if (error instanceof InviteError) return reply({ error: error.message }, error.status);
    console.error("duel-invite operation failed", error);
    return reply({ error: "عملیات دعوت انجام نشد؛ دوباره تلاش کن" }, 503);
  }
}
