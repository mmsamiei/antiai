import { isAccountSuspended } from "./account-suspensions";
import { publicDisplayName } from "./public-identity";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { currentPhraseChallenge } from "./phrase-hunt-challenge";
import { phraseHuntTargets } from "./data/phrase-hunt-targets";
import { phraseChallengeWindow } from "./phrase-hunt-schedule";
import { moderatePhraseHuntAnnouncementPhrases } from "./phrase-hunt-announcement-moderation";

const pollMs = 15_000;
const deliveryLeaseMs = 60_000;
const sendIntervalMs = 50;
const requestTimeoutMs = 10_000;
const retryBaseMs = 5_000;
const retryMaxMs = 30 * 60_000;

export type PhraseHuntWinnerCandidate = {
  id: string;
  userId: string;
  username: string | null;
  showUsername?: boolean;
  firstName: string | null;
  lastName: string | null;
  phrase: string;
  score: number;
  createdAt: Date;
};

export type PhraseHuntWinner = PhraseHuntWinnerCandidate & { displayName: string };

function compareWinnerGuess(a: PhraseHuntWinnerCandidate, b: PhraseHuntWinnerCandidate) {
  return b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

export function selectTopPhraseHuntWinners(candidates: PhraseHuntWinnerCandidate[]): PhraseHuntWinner[] {
  const bestByUser = new Map<string, PhraseHuntWinnerCandidate>();
  for (const candidate of candidates) {
    const current = bestByUser.get(candidate.userId);
    if (!current || compareWinnerGuess(candidate, current) < 0) bestByUser.set(candidate.userId, candidate);
  }
  return [...bestByUser.values()]
    .sort((a, b) => compareWinnerGuess(a, b) || a.userId.localeCompare(b.userId))
    .slice(0, 3)
    .map((winner) => ({
      ...winner,
      displayName: publicDisplayName(winner, true),
    }));
}

export function escapeTelegramHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export const phraseHuntOct18Postscript = "پی‌نوشت: قبول داریم که عبارت امروز سخت بود؛ از همهٔ شما که وقت گذاشتید و تلاش کردید ممنونیم. داریم برای بهترشدن داوری تلاش می‌کنیم. از امید موروثی بابت بازخوردهایش و از مجتبی پاک‌سرشت بابت ایده‌پردازی برای بهبود داوری تشکر می‌کنیم. نسخهٔ جدید داوری از همین چالش فعال شده است. چالش امشب یک عبارت دوکلمه‌ای است. موفق باشید!";

export function renderPhraseHuntAnnouncement(answer: string, winners: PhraseHuntWinner[], phraseVisibility = winners.map(() => true), postscript = "") {
  const rows = winners.map((winner, index) => {
    const medal = ["🥇", "🥈", "🥉"][index];
    const score = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(winner.score);
    const phrase = phraseVisibility[index] ? `«${escapeTelegramHtml(winner.phrase)}»` : "حدس نمایش داده نشد";
    return `${medal} <b>${escapeTelegramHtml(winner.displayName)}</b> — ${phrase} <code>${score} از ۱۰۰</code>`;
  });

  return [
    "🧠✨ <b>معناجو | نتیجهٔ چالش</b>",
    "",
    "⏰ چالش قبلی به پایان رسید.",
    `🎯 پاسخ این نوبت: <b>«${escapeTelegramHtml(answer)}»</b>`,
    ...(rows.length ? ["", "🏆 <b>نزدیک‌ترین حدس‌ها</b>", ...rows] : ["", "🌱 این نوبت هنوز حدسی ثبت نشده بود."]),
    "",
    "🚀 چالش تازه شروع شده؛ ببین چقدر به پاسخ نزدیک می‌شی!",
    ...(postscript ? ["", escapeTelegramHtml(postscript)] : []),
  ].join("\n");
}

export type TelegramDeliveryResult =
  | { kind: "sent" }
  | { kind: "permanent"; error: string }
  | { kind: "retry"; error: string; retryAfterMs?: number };

export function classifyTelegramResponse(httpStatus: number, body: unknown): TelegramDeliveryResult {
  const result = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (httpStatus >= 200 && httpStatus < 300 && result.ok === true) return { kind: "sent" };

  const errorCode = typeof result.error_code === "number" ? result.error_code : httpStatus;
  const description = typeof result.description === "string" ? result.description : `Telegram HTTP ${httpStatus}`;
  const parameters = result.parameters && typeof result.parameters === "object" ? result.parameters as Record<string, unknown> : {};
  if (errorCode === 429) {
    const retryAfter = typeof parameters.retry_after === "number" ? Math.max(1, parameters.retry_after) * 1000 : undefined;
    return { kind: "retry", error: description, ...(retryAfter ? { retryAfterMs: retryAfter } : {}) };
  }
  if (errorCode === 403 || errorCode === 400) return { kind: "permanent", error: description };
  return { kind: "retry", error: description };
}

export function retryDelayMs(attempt: number, retryAfterMs?: number) {
  if (retryAfterMs !== undefined) return retryAfterMs;
  return Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(Math.max(attempt - 1, 0), 10));
}

export function phraseHuntChallengeStartsToEnsure(now: Date, enabledAt: Date, ensuredThrough: Date | null) {
  const current = phraseChallengeWindow(now);
  const next = phraseChallengeWindow(new Date(current.endsAt.getTime() + 1));
  let cursor = ensuredThrough
    ? phraseChallengeWindow(ensuredThrough).endsAt
    : phraseChallengeWindow(enabledAt).startsAt;
  const starts: Date[] = [];
  while (cursor <= next.startsAt) {
    starts.push(cursor);
    cursor = phraseChallengeWindow(cursor).endsAt;
  }
  return { starts, through: next.startsAt };
}

async function ensureChallengesThrough(now: Date, enabledAt: Date, ensuredThrough: Date | null) {
  const scheduled = phraseHuntChallengeStartsToEnsure(now, enabledAt, ensuredThrough);
  for (const startsAt of scheduled.starts) await currentPhraseChallenge(startsAt);
  return scheduled.through;
}

async function buildAnnouncement(challenge: { id: string; targetId: string }) {
  const target = phraseHuntTargets.find((item) => item.id === challenge.targetId);
  if (!target) throw new Error(`Unknown PHRASE_HUNT target: ${challenge.targetId}`);

  const candidates = await prisma.$queryRaw<PhraseHuntWinnerCandidate[]>(Prisma.sql`
    SELECT DISTINCT ON (g."userId") pg."id", g."userId", u."username", u."showUsername", u."firstName", u."lastName", pg."phrase",
      pg."score"::double precision AS "score", pg."createdAt"
    FROM "PhraseHuntGuess" pg
    JOIN "GameSession" g ON g."id" = pg."gameId"
    JOIN "User" u ON u."id" = g."userId"
    WHERE g."phraseChallengeId" = ${challenge.id}
    ORDER BY g."userId", pg."score" DESC, pg."createdAt" ASC, pg."id" ASC
  `);
  const winners = selectTopPhraseHuntWinners(candidates);
  const phraseVisibility = await moderatePhraseHuntAnnouncementPhrases(winners.map((winner) => winner.phrase));
  const postscript = challenge.id === "2026-10-18T06:30:00.000Z" ? phraseHuntOct18Postscript
    : challenge.id === "2026-10-18T19:23:00.000Z" ? "🔎 پاسخ چالش صبح، یک واژه است."
    : challenge.id === "2026-10-19T06:30:00.000Z" ? "🔎 پی‌نوشت ۱: عبارت چالش امشب دو واژه است.\n\n💛 پی‌نوشت ۲: ممنونیم که بازی را به دیگران معرفی می‌کنید! اگر از معناجو لذت می‌برید، خوشحال می‌شویم آن را به دوستان و آشنایانتان هم معرفی کنید."
    : "";
  return { messageText: renderPhraseHuntAnnouncement(target.phrase, winners, phraseVisibility, postscript), winnerUserIds: winners.map(w => w.userId) };
}

export async function queueEndedPhraseHuntAnnouncements(enabledAt: Date, now: Date) {
  const ended = await prisma.phraseHuntChallenge.findMany({
    where: { endsAt: { gt: enabledAt, lte: now }, announcement: null },
    orderBy: { startsAt: "asc" },
    select: { id: true, targetId: true },
  });

  for (const challenge of ended) {
    const content = await buildAnnouncement(challenge);
    try {
      await prisma.$transaction(async (tx) => {
        const users = await tx.user.findMany({ where: { announcementsEnabled: true }, select: { id: true } });
        const announcement = await tx.phraseHuntAnnouncement.create({ data: { challengeId: challenge.id, ...content } });
        if (users.length) {
          await tx.phraseHuntAnnouncementDelivery.createMany({
            data: users.map(({ id }) => ({ announcementId: announcement.id, chatId: id })),
          });
        } else {
          await tx.phraseHuntAnnouncement.update({ where: { id: announcement.id }, data: { status: "COMPLETED", completedAt: now } });
        }
      });
      console.info("phrase-hunt announcement queued", challenge.id, "recipients", await prisma.phraseHuntAnnouncementDelivery.count({ where: { announcement: { challengeId: challenge.id } } }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
}

type ClaimedDelivery = { id: string; announcementId: string; chatId: string; attempts: number; messageText: string; winnerUserIds?: string[] };

async function claimDelivery(now: Date): Promise<ClaimedDelivery | null> {
  const leaseUntil = new Date(now.getTime() + deliveryLeaseMs);
  const rows = await prisma.$queryRaw<ClaimedDelivery[]>(Prisma.sql`
    WITH candidate AS (
      SELECT d."id", d."announcementId"
      FROM "PhraseHuntAnnouncementDelivery" d
      WHERE (d."status" = 'PENDING' AND d."nextAttemptAt" <= ${now})
         OR (d."status" = 'SENDING' AND d."leaseUntil" <= ${now})
      ORDER BY d."nextAttemptAt" ASC, d."id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "PhraseHuntAnnouncementDelivery" d
    SET "status" = 'SENDING', "attempts" = d."attempts" + 1, "leaseUntil" = ${leaseUntil}
    FROM candidate c
    JOIN "PhraseHuntAnnouncement" a ON a."id" = c."announcementId"
    WHERE d."id" = c."id"
    RETURNING d."id", d."announcementId", d."chatId", d."attempts", a."messageText", a."winnerUserIds"
  `);
  return rows[0] || null;
}

export function refreshAnnouncementNames(text: string, names: string[]) {
  return text.replace(/^([🥇🥈🥉]) <b>[^\n]*?<\/b> —/gmu, (_row, medal: string) => {
    const index = ["🥇", "🥈", "🥉"].indexOf(medal);
    return `${medal} <b>${escapeTelegramHtml(names[index] || "بازیکن ناشناس")}</b> —`;
  });
}

async function sendTelegramMessage(delivery: ClaimedDelivery): Promise<TelegramDeliveryResult> {
  if (isAccountSuspended(delivery.chatId)) return { kind: "permanent", error: "Account suspended" };
  const recipient = await prisma.user.findUnique({ where: { id: delivery.chatId }, select: { announcementsEnabled: true } });
  if (!recipient?.announcementsEnabled) return { kind: "permanent", error: "Announcements disabled" };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const miniAppUrl = process.env.MINI_APP_URL;
  if (!token || !miniAppUrl) throw new Error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required");

  try {
    let messageText = delivery.messageText;
    if (delivery.winnerUserIds?.length) {
      const users = await prisma.user.findMany({ where: { id: { in: delivery.winnerUserIds } } });
      const names = delivery.winnerUserIds.map(id => publicDisplayName(users.find(u => u.id === id), true));
      messageText = refreshAnnouncementNames(messageText, names);
    }
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: delivery.chatId,
        text: messageText,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🎮 ورود به چالش تازه", web_app: { url: miniAppUrl } }], [{ text: "🔕 قطع اعلان‌ها", callback_data: "announcements:off" }]] },
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    return classifyTelegramResponse(response.status, body);
  } catch (error) {
    return { kind: "retry", error: error instanceof Error ? `Telegram request failed (${error.name})` : "Telegram request failed" };
  }
}

async function finishAnnouncementIfDone(announcementId: string, now: Date) {
  const remaining = await prisma.phraseHuntAnnouncementDelivery.count({
    where: { announcementId, status: { in: ["PENDING", "SENDING"] } },
  });
  if (!remaining) {
    await prisma.phraseHuntAnnouncement.updateMany({
      where: { id: announcementId, status: "PENDING" },
      data: { status: "COMPLETED", completedAt: now },
    });
  }
}

export async function processPhraseHuntAnnouncementDelivery(now: Date) {
  const config = await prisma.phraseHuntNotificationConfig.findUnique({ where: { id: "global" }, select: { sendNotBefore: true } });
  if (config?.sendNotBefore && config.sendNotBefore > now) return false;

  const delivery = await claimDelivery(now);
  if (!delivery) return false;
  const result = await sendTelegramMessage(delivery);
  if (result.kind === "sent") {
    await prisma.phraseHuntAnnouncementDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null },
    });
  } else if (result.kind === "permanent") {
    await prisma.phraseHuntAnnouncementDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", leaseUntil: null, lastError: result.error.slice(0, 500) },
    });
    console.warn("phrase-hunt Telegram delivery permanently failed", delivery.id, result.error);
  } else {
    const retryAt = new Date(now.getTime() + retryDelayMs(delivery.attempts, result.retryAfterMs));
    await prisma.$transaction([
      prisma.phraseHuntAnnouncementDelivery.update({
        where: { id: delivery.id },
        data: { status: "PENDING", nextAttemptAt: retryAt, leaseUntil: null, lastError: result.error.slice(0, 500) },
      }),
      ...(result.retryAfterMs ? [prisma.phraseHuntNotificationConfig.update({ where: { id: "global" }, data: { sendNotBefore: retryAt } })] : []),
    ]);
  }
  await finishAnnouncementIfDone(delivery.announcementId, new Date());
  return true;
}

function waitFor(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });
}

export async function runPhraseHuntAnnouncementWorker(signal: AbortSignal) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.MINI_APP_URL) throw new Error("TELEGRAM_BOT_TOKEN and MINI_APP_URL are required");

  const config = await prisma.phraseHuntNotificationConfig.upsert({ where: { id: "global" }, create: { id: "global" }, update: {} });
  let ensuredThrough: Date | null = null;
  let nextScheduleCheck = 0;
  console.info("phrase-hunt announcement worker started");
  while (!signal.aborted) {
    const now = new Date();
    try {
      if (now.getTime() >= nextScheduleCheck) {
        ensuredThrough = await ensureChallengesThrough(now, config.enabledAt, ensuredThrough);
        await queueEndedPhraseHuntAnnouncements(config.enabledAt, now);
        const { queueGeographyChallengeAnnouncements } = await import("./geography-challenge-announcements");
        await queueGeographyChallengeAnnouncements(now);
        nextScheduleCheck = now.getTime() + pollMs;
      }
      if (await processPhraseHuntAnnouncementDelivery(now)) {
        await waitFor(sendIntervalMs, signal);
        continue;
      }
    } catch (error) {
      console.error("phrase-hunt announcement worker tick failed", error);
      nextScheduleCheck = 0;
    }
    if (!signal.aborted) await waitFor(Math.min(1_000, Math.max(50, nextScheduleCheck - Date.now())), signal);
  }
}
