import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { wordPrompts } from "@/lib/data/adjective-prompts";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = currentUserId();
  if (!userId || userId !== process.env.WORD_BANK_REVIEWER_USER_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ words: wordPrompts }, { headers: { "Cache-Control": "no-store" } });
}
