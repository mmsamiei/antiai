import { expect, it } from "vitest";
import { challengeTotals } from "./geography-challenge-totals";
it("ranks more solves first, then fewer guesses, then proximity for unsolved participants", () => {
  const entry = (userId: string, status: string, guessCount: number, bestRank: number) => ({ userId, status, guessCount, bestRank });
  const totals = challengeTotals([
    entry("two", "WON", 20, 0), entry("two", "WON", 20, 0),
    entry("slow", "WON", 8, 0), entry("fast", "WON", 3, 0),
    entry("near", "ACTIVE", 30, 2), entry("far", "SURRENDERED", 1, 40),
  ]);
  expect(totals.map(r => r.userId)).toEqual(["two", "fast", "slow", "near", "far"]);
});
it("uses stable identities to break ties and handles an empty board", () => {
  expect(challengeTotals([])).toEqual([]);
  expect(challengeTotals(["z", "a"].map(userId => ({ userId, status: "WON", guessCount: 5, bestRank: 0 }))).map(r => r.userId)).toEqual(["a", "z"]);
});
