import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { createFeedback, readFeedback, reviewFeedback } from "@/lib/feedback";
import { feedbackInput, feedbackReview } from "@/lib/feedback-config";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "FEEDBACK_FORBIDDEN") return reply({ error: "به این بخش دسترسی نداری." }, 403);
  if (code === "FEEDBACK_NOT_FOUND") return reply({ error: "این نظر پیدا نشد." }, 404);
  if (code === "FEEDBACK_LIMIT") return reply({ error: "در هر ۲۴ ساعت می‌توانی ۵ نظر ثبت کنی؛ لطفاً بعداً دوباره تلاش کن." }, 429);
  console.error("feedback request failed", error instanceof Error ? error.name : "UnknownError");
  return reply({ error: "ارتباط با نظرجو برقرار نشد؛ دوباره تلاش کن." }, 503);
}
const query = z.object({ view: z.enum(["mine", "leaderboard", "review"]).default("mine"), page: z.coerce.number().int().min(1).max(10000).default(1), status: z.enum(["PENDING", "REVIEWED", "ACCEPTED", "IMPLEMENTED"]).default("PENDING") });
export async function GET(request: Request) {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد بازی شو." }, 401);
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return reply({ error: "درخواست معتبر نیست." }, 400);
  try { return reply(await readFeedback(userId, parsed.data.view, parsed.data.page, parsed.data.status)); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد بازی شو." }, 401);
  const parsed = feedbackInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "نوع نظر، عنوان ۳ تا ۱۰۰ حرفی و متن ۱۰ تا ۳۰۰۰ حرفی را وارد کن." }, 400);
  try { return reply(await createFeedback(userId, parsed.data)); } catch (e) { return failure(e); }
}
export async function PATCH(request: Request) {
  const userId = currentUserId(); if (!userId) return reply({ error: "ابتدا وارد بازی شو." }, 401);
  const parsed = feedbackReview.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "وضعیت و پاسخ بررسی را کامل کن." }, 400);
  try { return reply(await reviewFeedback(userId, parsed.data)); } catch (e) { return failure(e); }
}
