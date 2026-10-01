import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { parseGameType } from "@/lib/game-service";
import { publicItem, searchItems } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!currentUserId()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const type = parseGameType(params.get("type"));
  const query = params.get("q") || "";
  if (!type || query.length > 80) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: searchItems(type, query).map(publicItem) }, { headers: { "Cache-Control": "no-store" } });
}
