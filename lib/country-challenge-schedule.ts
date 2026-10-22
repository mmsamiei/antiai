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

export function countryChallengeWindow(now = new Date()) {
  const p = tehranParts(now);
  const localStartHour = p.hour >= 21 ? 21 : p.hour >= 9 ? 9 : -3;
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day, localStartHour) - tehranOffset(now, p));
  const end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return { id: start.toISOString(), startsAt: start, endsAt: end };
}

export function countryChallengeTimes(startsAt: Date | string, now = new Date()) {
  const start = new Date(startsAt);
  return { id: start.toISOString(), startsAt: start, endsAt: new Date(+start + 12 * 60 * 60 * 1000), timeZone: COUNTRY_CHALLENGE_TIME_ZONE, serverNow: now };
}
