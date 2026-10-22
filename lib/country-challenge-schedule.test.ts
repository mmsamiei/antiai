import { describe, expect, it } from "vitest";
import { countryChallengeWindow } from "./country-challenge-schedule";

describe("country challenge schedule", () => {
  it("switches at 09:00 Tehran and keeps the previous 21:00 window beforehand", () => {
    const before = countryChallengeWindow(new Date("2026-10-22T05:29:59.000Z"));
    const at = countryChallengeWindow(new Date("2026-10-22T05:30:00.000Z"));
    expect(before.startsAt.toISOString()).toBe("2026-10-21T17:30:00.000Z");
    expect(at.startsAt.toISOString()).toBe("2026-10-22T05:30:00.000Z");
    expect(+at.endsAt - +at.startsAt).toBe(12 * 60 * 60 * 1000);
  });

  it("switches at 21:00 Tehran", () => {
    const before = countryChallengeWindow(new Date("2026-10-22T17:29:59.000Z"));
    const at = countryChallengeWindow(new Date("2026-10-22T17:30:00.000Z"));
    expect(before.startsAt.toISOString()).toBe("2026-10-22T05:30:00.000Z");
    expect(at.startsAt.toISOString()).toBe("2026-10-22T17:30:00.000Z");
  });
});
