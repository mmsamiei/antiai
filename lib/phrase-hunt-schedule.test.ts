import { describe, expect, it } from "vitest";
import { isCurrentPhraseChallenge, phraseChallengeTimes, phraseChallengeWindow, phraseWeekStart } from "./phrase-hunt-schedule";

describe("Tehran twice-daily phrase challenge", () => {
  it.each([
    ["2026-10-16T08:29:59.999Z", "2026-10-15T20:30:00.000Z", "2026-10-16T08:30:00.000Z"],
    ["2026-10-16T08:30:00Z", "2026-10-16T08:30:00.000Z", "2026-10-16T20:30:00.000Z"],
    ["2026-10-16T20:29:59.999Z", "2026-10-16T08:30:00.000Z", "2026-10-16T20:30:00.000Z"],
    ["2026-10-16T20:30:00Z", "2026-10-16T20:30:00.000Z", "2026-10-17T08:30:00.000Z"],
  ])("preserves historical noon/midnight slots for %s", (time, start, end) => {
    const window = phraseChallengeWindow(new Date(time));
    expect(window.id).toBe(start);
    expect(window.endsAt.toISOString()).toBe(end);
    expect(isCurrentPhraseChallenge(window.id, new Date(time))).toBe(true);
  });
  it.each([
    ["2026-10-17T18:29:59.999Z", "2026-10-17T08:30:00.000Z", "2026-10-17T18:30:00.000Z"],
    ["2026-10-17T18:30:00Z", "2026-10-17T18:30:00.000Z", "2026-10-18T06:30:00.000Z"],
    ["2026-10-18T06:29:59.999Z", "2026-10-17T18:30:00.000Z", "2026-10-18T06:30:00.000Z"],
    ["2026-10-18T06:30:00Z", "2026-10-18T06:30:00.000Z", "2026-10-18T19:30:00.000Z"],
    ["2026-10-18T18:29:59.999Z", "2026-10-18T06:30:00.000Z", "2026-10-18T19:30:00.000Z"],
    ["2026-10-18T18:30:00Z", "2026-10-18T06:30:00.000Z", "2026-10-18T19:30:00.000Z"],
    ["2026-10-18T19:29:59.999Z", "2026-10-18T06:30:00.000Z", "2026-10-18T19:30:00.000Z"],
    ["2026-10-18T19:30:00Z", "2026-10-18T19:30:00.000Z", "2026-10-19T06:30:00.000Z"],
    ["2026-10-19T06:29:59.999Z", "2026-10-18T19:30:00.000Z", "2026-10-19T06:30:00.000Z"],
    ["2026-10-19T06:30:00Z", "2026-10-19T06:30:00.000Z", "2026-10-19T18:30:00.000Z"],
    ["2026-11-01T01:00:00Z", "2026-10-31T18:30:00.000Z", "2026-11-01T06:30:00.000Z"],
    ["2027-01-01T01:00:00Z", "2026-12-31T18:30:00.000Z", "2027-01-01T06:30:00.000Z"],
  ])("uses the transition and Tehran 10:00/22:00 boundaries for %s", (time, start, end) => {
    const window = phraseChallengeWindow(new Date(time));
    expect(window.id).toBe(start);
    expect(window.endsAt.toISOString()).toBe(end);
    expect(phraseChallengeTimes(start).endsAt.toISOString()).toBe(end);
    expect(isCurrentPhraseChallenge(start, new Date(time))).toBe(true);
  });
  it("does not start the delayed challenge at the original 22:00 boundary", () => {
    expect(isCurrentPhraseChallenge("2026-10-18T18:30:00.000Z", new Date("2026-10-18T18:45:00Z"))).toBe(false);
    expect(isCurrentPhraseChallenge("2026-10-18T19:30:00.000Z", new Date("2026-10-18T19:30:00Z"))).toBe(true);
  });
  it("delays the 2026-10-20 evening challenge to 22:25 Tehran", () => {
    const before = phraseChallengeWindow(new Date("2026-10-20T18:54:59.999Z"));
    expect(before.id).toBe("2026-10-20T06:30:00.000Z");
    expect(before.endsAt.toISOString()).toBe("2026-10-20T18:55:00.000Z");
    const atStart = phraseChallengeWindow(new Date("2026-10-20T18:55:00.000Z"));
    expect(atStart.id).toBe("2026-10-20T18:55:00.000Z");
    expect(atStart.endsAt.toISOString()).toBe("2026-10-21T06:30:00.000Z");
    expect(isCurrentPhraseChallenge("2026-10-20T18:30:00.000Z", new Date("2026-10-20T18:55:00.000Z"))).toBe(false);
  });
  it("rejects old future slot IDs after the switch", () => {
    expect(isCurrentPhraseChallenge("2026-10-17T20:30:00.000Z", new Date("2026-10-17T21:00:00Z"))).toBe(false);
    expect(phraseChallengeTimes("2026-10-16T08:30:00.000Z").endsAt.toISOString()).toBe("2026-10-16T20:30:00.000Z");
  });
  it("rejects missing or previous challenge IDs", () => {
    const time = new Date("2026-10-16T08:30:00Z");
    expect(isCurrentPhraseChallenge(null, time)).toBe(false);
    expect(isCurrentPhraseChallenge("2026-10-15T20:30:00.000Z", time)).toBe(false);
  });
  it("keeps exact slot boundaries and tolerates caller mutations and time moving backwards", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const first = phraseChallengeWindow(now);
    first.startsAt.setTime(0);
    first.endsAt.setTime(0);
    expect(phraseChallengeWindow(now).id).toBe("2026-10-23T06:30:00.000Z");
    expect(phraseChallengeWindow(new Date("2026-10-23T18:30:00Z")).id).toBe("2026-10-23T18:30:00.000Z");
    expect(phraseChallengeWindow(now).id).toBe("2026-10-23T06:30:00.000Z");
    expect(phraseChallengeWindow(now).endsAt.toISOString()).toBe("2026-10-23T18:30:00.000Z");
  });
  it.each([
    ["2026-10-16T20:29:59Z", "2026-10-09T20:30:00.000Z"],
    ["2026-10-16T20:30:00Z", "2026-10-16T20:30:00.000Z"],
    ["2026-10-17T12:00:00Z", "2026-10-16T20:30:00.000Z"],
    ["2026-10-23T18:30:00Z", "2026-10-16T20:30:00.000Z"],
    ["2026-10-23T20:30:00Z", "2026-10-23T20:30:00.000Z"],
    ["2026-10-24T05:00:00Z", "2026-10-23T20:30:00.000Z"],
  ])("starts a week at Tehran Saturday midnight for %s", (time, start) => {
    expect(phraseWeekStart(new Date(time)).toISOString()).toBe(start);
  });
});
