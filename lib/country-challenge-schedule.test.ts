import { describe, expect, it } from "vitest";
import { countryChallengeTimes, countryChallengeWindow } from "./country-challenge-schedule";

describe("geographic challenge schedules", () => {
  it("keeps historical country IDs and shortens only the transition window", () => {
    expect(countryChallengeWindow(new Date("2026-10-21T05:29:59Z")).startsAt.toISOString()).toBe("2026-10-20T17:30:00.000Z");
    const before = countryChallengeWindow(new Date("2026-10-22T16:29:59.999Z"));
    expect(before.startsAt.toISOString()).toBe("2026-10-22T05:30:00.000Z");
    expect(before.endsAt.toISOString()).toBe("2026-10-22T16:30:00.000Z");
    expect(+before.endsAt - +before.startsAt).toBe(11 * 3600000);
    const after = countryChallengeWindow(new Date("2026-10-22T16:30:00Z"));
    expect(after.startsAt.toISOString()).toBe("2026-10-22T16:30:00.000Z");
    expect(after.endsAt.toISOString()).toBe("2026-10-23T04:30:00.000Z");
  });
  it("switches country at precisely 08:00 and 20:00 Tehran", () => {
    for (const start of ["2026-10-23T04:30:00Z", "2026-10-23T16:30:00Z", "2026-12-31T16:30:00Z", "2027-01-01T04:30:00Z"]) {
      const at = new Date(start), before = countryChallengeWindow(new Date(+at - 1)), next = countryChallengeWindow(at);
      expect(+before.endsAt).toBe(+at); expect(+next.startsAt).toBe(+at); expect(+next.endsAt - +at).toBe(12 * 3600000);
    }
  });
  it("keeps city at precisely 09:00 and 21:00 Tehran", () => {
    for (const start of ["2026-10-22T05:30:00Z", "2026-10-22T17:30:00Z", "2026-10-23T05:30:00Z", "2027-01-01T17:30:00Z"]) {
      const at = new Date(start), before = countryChallengeWindow(new Date(+at - 1), "IRAN_CITY"), next = countryChallengeWindow(at, "IRAN_CITY");
      expect(+before.endsAt).toBe(+at); expect(+next.startsAt).toBe(+at); expect(+next.endsAt - +at).toBe(12 * 3600000);
    }
    const city = countryChallengeWindow(new Date("2026-10-22T16:30:00Z"), "IRAN_CITY");
    expect(city.startsAt.toISOString()).toBe("2026-10-22T05:30:00.000Z");
  });
  it("serializes the persisted deadline including the shorter transition challenge", () => {
    const times = countryChallengeTimes("2026-10-22T05:30:00Z", new Date("2026-10-22T16:00Z"), "2026-10-22T16:30:00Z");
    expect(times.endsAt.toISOString()).toBe("2026-10-22T16:30:00.000Z");
  });
});
