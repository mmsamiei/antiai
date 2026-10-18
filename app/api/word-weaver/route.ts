import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import {
  getWordWeaverState,
  heartbeatWordWeaver,
  joinWordWeaver,
  leaveWordWeaver,
  submitWordWeaverEntry,
} from "@/lib/word-weaver";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const messages: Record<string, [string, number]> = {
  ENTRY_ALREADY_SUBMITTED: ["پاسخ ثبت نهایی شده و قابل ویرایش نیست.", 409],
  ENTRY_INVALID: ["پاسخ باید بین ۲ تا ۲۰۰ نویسه باشد.", 400],
  ROUND_NOT_WRITING: ["زمان نوشتن این دور تمام شده است.", 409],
  PLAYER_NOT_PRESENT: ["برای شرکت، اول وارد اتاق شو.", 409],
};

export async function GET() {
  const userId = currentUserId();
  if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401);
  return reply(await getWordWeaverState(userId));
}

export async function POST(request: Request) {
  const userId = currentUserId();
  if (!userId) return reply({ error: "ابتدا وارد بازی شو" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "درخواست معتبر نیست" }, 400);
  const action = (body as Record<string, unknown>).action;
  const clientId = (body as Record<string, unknown>).clientId;
  if (["join", "heartbeat", "leave"].includes(String(action)) && (typeof clientId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(clientId))) return reply({ error: "شناسهٔ حضور معتبر نیست" }, 400);
  try {
    if (action === "join") return reply(await joinWordWeaver(userId, clientId as string));
    if (action === "heartbeat") return reply(await heartbeatWordWeaver(userId, clientId as string));
    if (action === "leave") {
      await leaveWordWeaver(userId, clientId as string);
      return reply({ ok: true });
    }
    if (action === "submit") {
      const entry = await submitWordWeaverEntry(userId, (body as Record<string, unknown>).text);
      return reply({ entry });
    }
    return reply({ error: "درخواست معتبر نیست" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const [message, status] = messages[code] || ["عملیات انجام نشد", 500];
    return reply({ error: message }, status);
  }
}
