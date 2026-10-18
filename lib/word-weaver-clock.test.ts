import { describe, expect, it, vi } from "vitest";
import { remainingWordWeaverSeconds, sampleWordWeaverClock } from "./word-weaver-clock";

const start = "2026-10-16T00:00:00.000Z";
const deadline = "2026-10-16T00:00:30.000Z";

describe("word-weaver countdown", () => {
  it("counts every second between server polls", () => {
    const clock = sampleWordWeaverClock(start, 500);
    expect([500, 1500, 2500, 3500].map((now) => remainingWordWeaverSeconds(deadline, clock, now))).toEqual([30, 29, 28, 27]);
    expect(remainingWordWeaverSeconds(deadline, clock, 1499)).toBe(30);
    expect(remainingWordWeaverSeconds(deadline, clock, 1500)).toBe(29);
  });
  it("is independent of wall-clock changes and late rendering intervals", () => {
    const clock = sampleWordWeaverClock(start, 500);
    const wallClock = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      expect(remainingWordWeaverSeconds(deadline, clock, 5700)).toBe(25);
      wallClock.mockReturnValue(9999999999999);
      expect(remainingWordWeaverSeconds(deadline, clock, 6700)).toBe(24);
    } finally { wallClock.mockRestore(); }
  });
  it("resynchronizes to server time after returning to the app and never goes negative", () => {
    const clock = sampleWordWeaverClock("2026-10-16T00:00:22.000Z", 100);
    expect(remainingWordWeaverSeconds(deadline, clock, 100)).toBe(8);
    expect(remainingWordWeaverSeconds(deadline, clock, 8100)).toBe(0);
    expect(remainingWordWeaverSeconds(deadline, clock, 99999)).toBe(0);
    expect(remainingWordWeaverSeconds(null, clock, 100)).toBe(0);
  });
});
