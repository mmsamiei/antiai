import { describe, expect, it } from "vitest";
import { RaceCountdown } from "./race-countdown";

describe("race countdown", () => {
  const deadline = "2026-10-22T12:03:20.000Z";
  it("keeps one monotonic countdown despite delayed and repeated server responses", () => {
    const clock = new RaceCountdown();
    clock.sync(deadline, "2026-10-22T12:00:00.000Z", 100, 200);
    expect(clock.seconds(100)).toBe(200);
    expect(clock.seconds(1100)).toBe(199);
    clock.sync(deadline, "2026-10-22T12:00:00.000Z", 2100, 10);
    expect(clock.seconds(2100)).toBe(198);
    clock.sync(deadline, "2026-10-22T12:00:04.000Z", 2200, 3000);
    expect(clock.seconds(2200)).toBe(198);
    expect(clock.seconds(300000)).toBe(0);
  });
  it("starts a fresh clock only for a changed deadline", () => {
    const clock = new RaceCountdown();
    clock.sync(null, "2026-10-22T12:00:00.000Z", 0, 0);
    expect(clock.seconds(0)).toBe(0);
    clock.sync(deadline, "2026-10-22T12:00:00.000Z", 0, 0);
    clock.sync("2026-10-22T12:05:00.000Z", "2026-10-22T12:00:00.000Z", 1000, 0);
    expect(clock.seconds(1000)).toBe(300);
  });
});
