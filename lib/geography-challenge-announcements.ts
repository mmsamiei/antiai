import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { countryChallengeWindow } from "./country-challenge-schedule";
import { countryChallengeLeaderboard, ensureCountryChallengeAt } from "./country-challenge";
import { escapeTelegramHtml, refreshAnnouncementNames } from "./phrase-hunt-announcements";
import { publicDisplayName } from "./public-identity";
import { isAccountSuspended } from "./account-suspensions";
import type { GeoRaceType } from "./geo-race-config";

type Winner = { userId: string; displayName: string; challengeSolved: boolean; guessCount: number; bestScore: number | null };
export function renderGeographyAnnouncement(type: GeoRaceType, answer: string | null, winners: Winner[]) {
  const city = type === "IRAN_CITY", name = city ? "شهرجو" : "کشورجو";
  return [
    `${city ? "📍" : "🌍"} <b>${name} | چالش تازه شروع شد!</b>`, "",
    ...(answer ? [`🎯 پاسخ چالش قبلی: <b>«${escapeTelegramHtml(answer)}»</b>`, "",
      ...winners.map((w, i) => `${["🥇", "🥈", "🥉"][i]} <b>${escapeTelegramHtml(w.displayName)}</b> — ${w.challengeSolved ? `حل با ${w.guessCount.toLocaleString("fa-IR")} حدس` : `بهترین رتبه: ${w.bestScore?.toLocaleString("fa-IR") ?? "—"}`}`), ""] : []),
    `یک ${city ? "شهر" : "کشور"} تازه برای همه پنهان شده؛ پیدایش می‌کنی؟`,
    `⏰ هر روز ساعت ${city ? "۹ صبح و ۹ شب" : "۸ صبح و ۸ شب"} به وقت تهران`,
    `🎮 وارد بازی شو و «${name} ← چالش روزانه» را انتخاب کن.`,
  ].join("\n");
}

// Uses the existing durable Telegram outbox, retry/backoff, privacy refresh and rate limit.
export async function queueGeographyChallengeAnnouncements(now = new Date()) {
  for (const gameType of ["COUNTRY", "IRAN_CITY"] as const) {
    let config = await prisma.geoChallengeNotificationConfig.upsert({ where: { gameType }, create: { gameType }, update: {} });
    await ensureCountryChallengeAt(now, gameType);
    for (let n = 0; n < 4; n++) {
      const nextStart = countryChallengeWindow(config.lastQueuedStart || config.enabledAt, gameType).endsAt;
      if (nextStart > now) break;
      const current = await ensureCountryChallengeAt(nextStart, gameType);
      const previous = await prisma.countryChallenge.findFirst({ where: { gameType, endsAt: { lte: nextStart } }, orderBy: { startsAt: "desc" } });
      const board = previous ? await countryChallengeLeaderboard("announcement", previous.id, gameType) : null;
      const winners = (board?.rows || []).filter(r => r.guessCount > 0).slice(0, 3);
      const users = await prisma.user.findMany({ where: { id: { in: winners.map(w => w.userId) } } });
      const winnerUserIds = winners.map(w => w.userId);
      const messageText = refreshAnnouncementNames(renderGeographyAnnouncement(gameType, board?.challenge.target ?? null, winners), winnerUserIds.map(id => publicDisplayName(users.find(u => u.id === id), true)));
      try {
        await prisma.$transaction(async tx => {
          const recipients = (await tx.user.findMany({ select: { id: true } })).filter(u => !isAccountSuspended(u.id));
          const announcement = await tx.phraseHuntAnnouncement.create({ data: { geoChallengeId: current.id, messageText, winnerUserIds, ...(recipients.length ? {} : { status: "COMPLETED", completedAt: now }) } });
          if (recipients.length) await tx.phraseHuntAnnouncementDelivery.createMany({ data: recipients.map(u => ({ announcementId: announcement.id, chatId: u.id })) });
          await tx.geoChallengeNotificationConfig.update({ where: { gameType }, data: { lastQueuedStart: nextStart } });
        });
        console.info("geography challenge announcement queued", gameType, current.id);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
      config = await prisma.geoChallengeNotificationConfig.findUniqueOrThrow({ where: { gameType } });
    }
  }
}
