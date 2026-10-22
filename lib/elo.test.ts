import { describe, expect, it } from "vitest";
import { eloResult } from "./elo";
describe("match Elo", () => {
  it("equal players exchange sixteen points", () => { expect(eloResult(1000, 1000, 1)).toEqual({ one: 1016, two: 984 }); });
  it("is zero sum and rewards upsets more", () => {
    const upset = eloResult(800, 1200, 1), expected = eloResult(1200, 800, 1);
    expect(upset.one - 800).toBeGreaterThan(expected.one - 1200);
    expect(upset.one + upset.two).toBe(2000);
  });
  it("draws equal players without change and adjusts unequal players", () => {
    expect(eloResult(1000, 1000, .5)).toEqual({ one: 1000, two: 1000 });
    expect(eloResult(1200, 800, .5).one).toBeLessThan(1200);
  });
});
