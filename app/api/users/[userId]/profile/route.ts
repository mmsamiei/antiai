import { publicDisplayName, publicUsername } from "@/lib/public-identity";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readSemantrisState } from "@/lib/semantris";
import { buildPublicProfileStats } from "@/lib/public-profile";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { userId: string } },
) {
  const viewerId = currentUserId();
  if (!viewerId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      showUsername: true,
      announcementsEnabled: true,
      photoUrl: true,
      acceptsGameInvites: true,
    },
  });
  if (!profile)
    return NextResponse.json({ error: "کاربر پیدا نشد" }, { status: 404 });

  const [geographyGroups, semantrisSessions, duelGroups, phraseHuntSessions] = await Promise.all([
    prisma.gameSession.groupBy({
      by: ["type", "status"],
      where: {
        userId: profile.id,
        type: { in: ["IRAN_CITY", "COUNTRY", "ANIMAL"] },
        status: { not: "ACTIVE" },
      },
      _count: { _all: true },
      _avg: { guessesCount: true },
      _min: { guessesCount: true },
    }),
    prisma.gameSession.findMany({
      where: {
        userId: profile.id,
        type: "SEMANTRIS",
        status: { in: ["ACTIVE", "WON", "SURRENDERED"] },
      },
      select: { semantrisState: true },
    }),
    prisma.gameSession.groupBy({
      by: ["status"],
      where: {
        userId: profile.id,
        type: "LETTER_DUEL",
        status: { in: ["WON", "LOST", "DRAW"] },
      },
      _count: { _all: true },
    }),
    prisma.gameSession.findMany({
      where: { userId: profile.id, type: "PHRASE_HUNT", status: { not: "ACTIVE" } },
      select: { status: true, phraseGuesses: { select: { score: true } } },
    }),
  ]);

  const stats = buildPublicProfileStats(
    geographyGroups.map((group) => ({
      type: group.type,
      status: group.status,
      count: group._count._all,
      averageGuesses: group.status === "WON" ? group._avg.guessesCount : null,
      bestGame: group.status === "WON" ? group._min.guessesCount : null,
    })),
    semantrisSessions.map((session) =>
      Math.max(0, readSemantrisState(session.semantrisState)?.score || 0),
    ),
    duelGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
    })),
    phraseHuntSessions.map((session) => ({
      status: session.status,
      bestScore: Math.max(0, ...session.phraseGuesses.map((guess) => guess.score)),
    })),
  );

  return NextResponse.json(
    {
      user: {
        acceptsGameInvites: profile.acceptsGameInvites,
        id: profile.id,
        displayName: publicDisplayName(profile),
        username: publicUsername(profile),
        photoUrl: profile.photoUrl,
        isMe: profile.id === viewerId,
        ...(profile.id === viewerId ? { showUsername: profile.showUsername, announcementsEnabled: profile.announcementsEnabled } : {}),
      },
      stats,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
