import { z } from "zod";
export const feedbackKinds = { SUGGESTION: "پیشنهاد", CRITICISM: "انتقاد", BUG: "گزارش باگ", FEATURE: "درخواست قابلیت" } as const;
export const feedbackStatuses = { PENDING: "در انتظار بررسی", REVIEWED: "بررسی‌شده", ACCEPTED: "پذیرفته‌شده", IMPLEMENTED: "انجام‌شده" } as const;
export const FEEDBACK_POINTS = 10;
export const feedbackInput = z.object({
  requestId: z.string().uuid(),
  kind: z.enum(["SUGGESTION", "CRITICISM", "BUG", "FEATURE"]),
  title: z.string().trim().min(3).max(100),
  body: z.string().trim().min(10).max(3000),
});
export const feedbackReview = z.object({
  id: z.string().min(1).max(80),
  status: z.enum(["PENDING", "REVIEWED", "ACCEPTED", "IMPLEMENTED"]),
  reply: z.string().trim().min(1).max(1500),
});
export function feedbackPoints(status: string) { return status === "ACCEPTED" || status === "IMPLEMENTED" ? FEEDBACK_POINTS : 0; }
