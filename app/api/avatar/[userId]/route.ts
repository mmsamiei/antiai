import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  if (!currentUserId()) return new NextResponse(null, { status: 401 });
  if (!/^\d+$/.test(params.userId)) return new NextResponse(null, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { photoUrl: true } });
  if (!user?.photoUrl) return new NextResponse(null, { status: 404 });

  let source: URL;
  try {
    source = new URL(user.photoUrl);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (source.protocol !== "https:" || source.hostname !== "t.me" || !source.pathname.startsWith("/i/userpic/320/")) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const image = await fetch(source, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    const finalHost = new URL(image.url).hostname;
    const contentType = image.headers.get("content-type")?.split(";", 1)[0].toLowerCase();
    if (!image.ok || !contentType || !imageTypes.has(contentType) ||
      (finalHost !== "t.me" && finalHost !== "telesco.pe" && !finalHost.endsWith(".telesco.pe"))) {
      return new NextResponse(null, { status: 502 });
    }
    return new NextResponse(await image.arrayBuffer(), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
