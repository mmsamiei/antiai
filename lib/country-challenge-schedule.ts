import type { GeoRaceType } from "./geo-race-config";
export const COUNTRY_CHALLENGE_TIME_ZONE = "Asia/Tehran";
const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: COUNTRY_CHALLENGE_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function tehranParts(now: Date) {
  return Object.fromEntries(clock.formatToParts(now).map(({ type, value }) => [type, Number(value)])) as Record<string, number>;
}

function tehranOffset(now: Date, parts = tehranParts(now)) {
  const localTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localTime - Math.floor(now.getTime() / 1000) * 1000;
}

// Preserve historical 09:00/21:00 country IDs; switch at 20:00 Tehran tonight.
export const COUNTRY_SCHEDULE_CHANGE = Date.parse("2026-10-22T16:30:00.000Z");

export function countryChallengeWindow(now = new Date(), gameType: GeoRaceType = "COUNTRY") {
  const p = tehranParts(now);
  const morning = gameType === "COUNTRY" && +now >= COUNTRY_SCHEDULE_CHANGE ? 8 : 9;
  const evening = morning + 12;
  const localStartHour = p.hour >= evening ? evening : p.hour >= morning ? morning : evening - 24;
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day, localStartHour) - tehranOffset(now, p));
  const naturalEnd = start.getTime() + 12 * 60 * 60 * 1000;
  const end = new Date(gameType === "COUNTRY" && +now < COUNTRY_SCHEDULE_CHANGE ? Math.min(naturalEnd, COUNTRY_SCHEDULE_CHANGE) : naturalEnd);
  return { id: start.toISOString(), startsAt: start, endsAt: end };
}

export function countryChallengeTimes(startsAt: Date | string, now = new Date(), endsAt?: Date | string) {
  const start = new Date(startsAt);
  return { id: start.toISOString(), startsAt: start, endsAt: endsAt ? new Date(endsAt) : new Date(+start + 12 * 60 * 60 * 1000), timeZone: COUNTRY_CHALLENGE_TIME_ZONE, serverNow: now };
}
