import { geoRaceConfig } from "./geo-race-config";
import { describe, expect, it } from "vitest";
import { COUNTRY_RACE_MS, raceTimeoutWinner } from "./country-race-state";
describe("country race timeout rules", () => {
  it("uses a 300-second maximum for city races", () => expect(geoRaceConfig.IRAN_CITY.durationMs).toBe(300_000));
  it("uses a 200-second maximum", () => expect(COUNTRY_RACE_MS).toBe(200_000));
  it("awards the lower rank, regardless of how many guesses were made", () => {
    expect(raceTimeoutWinner("a", "b", 3, 9)).toBe("a");
    expect(raceTimeoutWinner("a", "b", 9, 3)).toBe("b");
  });
  it("draws on equal ranks or no guesses", () => {
    expect(raceTimeoutWinner("a", "b", 7, 7)).toBeNull();
    expect(raceTimeoutWinner("a", "b", null, null)).toBeNull();
  });
  it("ranks a valid guess above no guess", () => {
    expect(raceTimeoutWinner("a", "b", 197, null)).toBe("a");
    expect(raceTimeoutWinner("a", "b", null, 197)).toBe("b");
  });
});
