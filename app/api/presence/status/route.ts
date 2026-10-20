import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!currentUserId()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const userIds = body?.userIds;
  if (!Array.isArray(userIds) || userIds.length > 100 || userIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9:_-]{1,64}$/.test(id))) {
    return NextResponse.json({ error: "Invalid user IDs" }, { status: 400 });
  }
  const rows = await prisma.onlinePresence.findMany({
    where: { userId: { in: [...new Set(userIds)] }, lastSeenAt: { gte: new Date(Date.now() - 20_000) } },
    select: { userId: true }
  });
  return NextResponse.json({ onlineUserIds: rows.map((row) => row.userId) }, { headers: { "Cache-Control": "no-store" } });
}
