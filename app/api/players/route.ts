import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizePersian } from "@/lib/normalize-persian";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const me = currentUserId();
  if (!me) return NextResponse.json({ error: "ابتدا وارد شو" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const raw = params.get("q") || "";
  const page = Number(params.get("page") || "0");
  if (raw.length > 80 || !Number.isSafeInteger(page) || page < 0 || page > 10000) return NextResponse.json({ error: "جست‌وجوی معتبر وارد کن" }, { status: 400 });
  const term = raw.replace(/^@/, "").trim();
  const q = normalizePersian(term);
  const cutoff = new Date(Date.now() - 20_000);
  // Usernames preserve underscores; Persian names use the same letter/spacing normalization as input.
  const nameSearch = q ? Prisma.sql`strpos(lower(regexp_replace(regexp_replace(translate(normalize(concat_ws(' ', u."firstName", u."lastName"), NFKC), 'يىكأإٱةـ‌', 'ییکاااه  '), '[ً-ٰٟ]', '', 'g'), '[^[:alnum:]]+', ' ', 'g')), ${q}) > 0` : Prisma.sql`false`;
  const search = term ? Prisma.sql`AND ((u."showUsername" AND strpos(lower(COALESCE(u."username", '')), lower(${term})) > 0) OR ${nameSearch})` : Prisma.sql`AND p."lastSeenAt" >= ${cutoff}`;
  const rows = await prisma.$queryRaw<Array<{id: string; firstName: string | null; lastName: string | null; username: string | null; photoUrl: string | null; online: boolean; acceptsGameInvites: boolean}>>(Prisma.sql`
    SELECT u."id", u."firstName", u."lastName", CASE WHEN u."showUsername" THEN u."username" ELSE NULL END AS "username", u."photoUrl", u."acceptsGameInvites", COALESCE(p."lastSeenAt" >= ${cutoff}, false) AS "online"
    FROM "User" u LEFT JOIN "OnlinePresence" p ON p."userId" = u."id"
    WHERE u."id" <> ${me} ${search}
    ORDER BY "online" DESC, u."id" ASC LIMIT 31 OFFSET ${page * 30}`);
  return NextResponse.json({ players: rows.slice(0, 30), hasMore: rows.length > 30 }, { headers: { "Cache-Control": "no-store" } });
}
