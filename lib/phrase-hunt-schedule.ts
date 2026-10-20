export const PHRASE_CHALLENGE_TIME_ZONE = "Asia/Tehran";
const twelveHours = 12 * 60 * 60 * 1000;
// One-time delay requested for 2026-10-18 only. Resume 10:00/22:00 tomorrow.
const delayedDayStart = Date.parse("2026-10-18T06:30:00.000Z");
const delayedNightStart = Date.parse(process.env.PHRASE_HUNT_OCT18_NIGHT_START || "2026-10-18T19:30:00.000Z");
const normalScheduleResumes = Date.parse("2026-10-19T06:30:00.000Z");
// One-time 25 minute delay for the 2026-10-20 evening challenge (22:25 Tehran).
const delayedOct20DayStart = Date.parse("2026-10-20T06:30:00.000Z");
const delayedOct20NightStart = Date.parse("2026-10-20T18:55:00.000Z");
const oct20ScheduleResumes = Date.parse("2026-10-21T06:30:00.000Z");
// The final noon challenge ends early at 22:00 Tehran on 2026-10-17.
// Preserve historical IDs and sessions; subsequent slots begin at 10:00/22:00.
const scheduleChangedAt = Date.parse("2026-10-17T18:30:00.000Z");
const localClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: PHRASE_CHALLENGE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function tehranClock(now: Date) {
  const parts = Object.fromEntries(localClock.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const localEpoch = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = localEpoch - Math.floor(now.getTime() / 1000) * 1000;
  return { parts, offset };
}

function challengeEnd(startsAt: Date) {
  if (startsAt.getTime() === delayedOct20DayStart) return new Date(delayedOct20NightStart);
  if (startsAt.getTime() === delayedOct20NightStart) return new Date(oct20ScheduleResumes);
  if (startsAt.getTime() === delayedDayStart) return new Date(delayedNightStart);
  if (startsAt.getTime() === delayedNightStart) return new Date(normalScheduleResumes);
  const end = startsAt.getTime() + twelveHours;
  return new Date(startsAt.getTime() < scheduleChangedAt ? Math.min(end, scheduleChangedAt) : end);
}

export function phraseChallengeWindow(now = new Date()) {
  if (now.getTime() >= delayedOct20DayStart && now.getTime() < oct20ScheduleResumes) {
    const startsAt = new Date(now.getTime() < delayedOct20NightStart ? delayedOct20DayStart : delayedOct20NightStart);
    return { id: startsAt.toISOString(), startsAt, endsAt: challengeEnd(startsAt) };
  }
  if (now.getTime() >= delayedDayStart && now.getTime() < normalScheduleResumes) {
    const startsAt = new Date(now.getTime() < delayedNightStart ? delayedDayStart : delayedNightStart);
    return { id: startsAt.toISOString(), startsAt, endsAt: challengeEnd(startsAt) };
  }
  const { parts, offset } = tehranClock(now);
  const startHour = now.getTime() < scheduleChangedAt
    ? (parts.hour < 12 ? 0 : 12)
    : (parts.hour >= 22 ? 22 : parts.hour >= 10 ? 10 : -2);
  // Date.UTC normalizes -2 to 22:00 on the preceding calendar day.
  const startsAt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, startHour) - offset);
  return { id: startsAt.toISOString(), startsAt, endsAt: challengeEnd(startsAt) };
}

export function isCurrentPhraseChallenge(id: string | null | undefined, now = new Date()) {
  return id === phraseChallengeWindow(now).id;
}

export function phraseChallengeTimes(id: string) {
  const startsAt = new Date(id);
  return { id, startsAt, endsAt: challengeEnd(startsAt), timeZone: PHRASE_CHALLENGE_TIME_ZONE, serverNow: new Date() };
}

export function phraseWeekStart(now = new Date()) {
  // The leaderboard week still begins at Saturday midnight, independently
  // of the challenge that started at 22:00 on Friday.
  const { parts, offset } = tehranClock(now);
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day - ((day + 1) % 7)) - offset);
}
