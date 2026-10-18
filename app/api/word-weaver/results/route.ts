import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getWordWeaverResults } from "@/lib/word-weaver";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const userId = currentUserId();
  if (!userId) return NextResponse.json({ error: "ابتدا وارد بازی شو" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const search = new URL(request.url).searchParams;
  try {
    const data = await getWordWeaverResults(search.get("round"), userId);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const errors: Record<string, [string, number]> = {
      RESULT_NOT_READY: ["نتیجه هنوز آماده نیست.", 409],
      CURSOR_INVALID: ["صفحهٔ نتیجه معتبر نیست.", 400],
    };
    const [message, status] = errors[code] || ["دریافت نتیجه انجام نشد.", 500];
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
