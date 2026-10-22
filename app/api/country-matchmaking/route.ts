import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { cancelCountryMatch, readCountryMatch, respondToCountryMatch, startCountryMatch } from "@/lib/country-matchmaking";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), gameType: z.enum(["COUNTRY", "IRAN_CITY"]).default("COUNTRY") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.enum(["accept", "reject"]), offerId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/) }),
]);
function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const known: Record<string, [string, number]> = {
    MATCH_SEARCH_UNAVAILABLE: ["برای پیدا کردن حریف باید آنلاین و خارج از بازی باشی.", 409],
    MATCH_OFFER_NOT_FOUND: ["این پیشنهاد مچینگ پیدا نشد.", 404],
    MATCH_OFFER_EXPIRED: ["مهلت این پیشنهاد تمام شده است.", 409],
    MATCH_OFFER_UNAVAILABLE: ["دیگر نمی‌توانی این پیشنهاد را بپذیری.", 409],
    MATCH_SENDER_OFFLINE: ["بازیکن جست‌وجوگر دیگر آنلاین نیست.", 409],
  };
  const [message, status] = known[code] || ["عملیات پیدا کردن حریف انجام نشد؛ دوباره تلاش کن.", 503];
  return reply({ error: message }, status);
}
export async function GET() {
  const userId = currentUserId();
  if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401);
  try { return reply(await readCountryMatch(userId)); } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "درخواست معتبر نیست" }, 400);
  try {
    const body = parsed.data;
    if (body.action === "start") await startCountryMatch(userId, body.gameType);
    else if (body.action === "cancel") await cancelCountryMatch(userId);
    else await respondToCountryMatch(userId, body.offerId, body.action);
    return reply(await readCountryMatch(userId));
  } catch (error) { return errorResponse(error); }
}
