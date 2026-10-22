import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { readCountryChallenge, startCountryChallenge, submitCountryChallengeGuess, surrenderCountryChallenge } from "@/lib/country-challenge";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("guess"), itemId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("surrender") }),
]);

export async function GET(request: Request) {
  const userId = currentUserId();
  if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401);
  const id = new URL(request.url).searchParams.get("id") || undefined;
  if (id && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(id) || Number.isNaN(Date.parse(id)))) return reply({ error: "شناسهٔ چالش معتبر نیست" }, 400);
  const state = await readCountryChallenge(userId, id);
  return state ? reply(state) : reply({ error: "چالش پیدا نشد" }, 404);
}

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "درخواست معتبر نیست" }, 400);
  try {
    const state = parsed.data.action === "start" ? await startCountryChallenge(userId)
      : parsed.data.action === "guess" ? await submitCountryChallengeGuess(userId, parsed.data.itemId)
      : await surrenderCountryChallenge(userId);
    return reply(state);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    const known: Record<string, [string, number]> = {
      CHALLENGE_ENDED: ["زمان این چالش تمام شده است.", 409],
      CHALLENGE_NOT_STARTED: ["اول چالش را شروع کن.", 409],
      CHALLENGE_ENTRY_CLOSED: ["این چالش برای تو تمام شده است.", 409],
      ITEM_NOT_FOUND: ["یک کشور معتبر انتخاب کن.", 400],
    };
    const [message, status] = known[code] || ["ثبت پاسخ انجام نشد؛ دوباره تلاش کن.", 503];
    return reply({ error: message }, status);
  }
}
