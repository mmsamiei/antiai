import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { readSocialStatus } from "@/lib/social-status";
export const dynamic = "force-dynamic";
export async function GET() {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد شو" }, { status: 401 });
  try {
    return NextResponse.json(await readSocialStatus(userId), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "دریافت وضعیت بازی ممکن نشد" }, { status: 503 }); }
}
