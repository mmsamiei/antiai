import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { actCountryRace, readCountryRace, rematchCountryRace } from "@/lib/country-race";
import { actOnInvite, InviteError } from "@/lib/duel-invites";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9:_-]+$/);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["heartbeat", "leave", "rematch"]), id }),
  z.object({ action: z.literal("guess"), id, itemId: z.string().min(1).max(80) }),
  z.object({ action: z.literal("choose"), id, itemId: z.string().min(1).max(80) }),
  z.object({ action: z.literal("ready"), id, inviteId: id })
]);
async function handle(run: () => Promise<unknown>) {
  try { return reply(await run()); } catch (e) {
    if (e instanceof InviteError) return reply({ error: e.message }, e.status);
    console.error("country race operation failed", e instanceof Error ? e.name : "unknown");
    return reply({ error: "ارتباط مسابقه برقرار نشد؛ دوباره تلاش کن" }, 503);
  }
}
export async function GET(request: Request) {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد شو" }, 401);
  const parsed = id.safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return reply({ error: "درخواست معتبر نیست" }, 400);
  return handle(async () => ({ race: await readCountryRace(userId, parsed.data) }));
}
export async function POST(request: Request) {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد شو" }, 401);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "درخواست معتبر نیست" }, 400);
  return handle(async () => {
    const body = parsed.data;
    if (body.action === "rematch") { await rematchCountryRace(userId, body.id); return { race: await readCountryRace(userId, body.id), invited: true }; }
    if (body.action === "ready") {
      const race = await readCountryRace(userId, body.id);
      if (race.invite?.id !== body.inviteId) throw new InviteError("دعوت پیدا نشد", 404);
      await actOnInvite(userId, body.inviteId, "ready");
      return { race: await readCountryRace(userId, body.id) };
    }
    return { race: await actCountryRace(userId, body.id, body.action, body.action === "guess" || body.action === "choose" ? body.itemId : undefined) };
  });
}
