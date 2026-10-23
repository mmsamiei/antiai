import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/auth";
import { isFeedbackAdmin } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";
import { publicDisplayName, publicUsername } from "@/lib/public-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export async function GET(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401 });
  if (!isFeedbackAdmin(userId)) return NextResponse.json({ error: "به این بخش دسترسی نداری." }, { status: 403 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "بازهٔ زمانی یا شمارهٔ صفحه معتبر نیست." }, { status: 400 });

  const now = new Date();
  const from = parsed.data.from ? new Date(parsed.data.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = parsed.data.to ? new Date(parsed.data.to) : now;
  if (from > to) return NextResponse.json({ error: "زمان شروع باید پیش از زمان پایان باشد." }, { status: 400 });

  const where = { messageAt: { gte: from, lte: to } };
  const pageSize = 50;
  const [events, total] = await Promise.all([
    prisma.telegramStartEvent.findMany({ where, orderBy: [{ messageAt: "desc" }, { updateId: "desc" }], skip: (parsed.data.page - 1) * pageSize, take: pageSize }),
    prisma.telegramStartEvent.count({ where }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(events.map(event => event.telegramUserId))] } },
    select: { id: true, firstName: true, lastName: true, username: true, showUsername: true },
  });
  const userById = new Map(users.map(user => [user.id, user]));
  const rows = events.map(event => {
    const currentUser = userById.get(event.telegramUserId);
    const identity = currentUser
      ? currentUser
      : { firstName: event.firstName, lastName: event.lastName, username: event.username, showUsername: true };
    return {
      telegramUserId: event.telegramUserId,
      name: publicDisplayName(identity),
      username: publicUsername(identity),
      payloadKind: event.payloadKind,
      messageAt: event.messageAt,
      receivedAt: event.receivedAt,
    };
  });

  return NextResponse.json({ from, to, page: parsed.data.page, pageSize, total, hasMore: parsed.data.page * pageSize < total, events: rows }, { headers: { "Cache-Control": "no-store" } });
}
