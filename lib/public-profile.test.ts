import { describe, expect, it } from "vitest";
import { buildPublicProfileStats } from "./public-profile";

describe("buildPublicProfileStats", () => {
  it("keeps geography games separate and ignores active sessions", () => {
    const stats = buildPublicProfileStats(
      [
        { type: "IRAN_CITY", status: "WON", count: 2, averageGuesses: 4.5, bestGame: 3 },
        { type: "IRAN_CITY", status: "SURRENDERED", count: 1, averageGuesses: null, bestGame: null },
        { type: "COUNTRY", status: "WON", count: 1, averageGuesses: 7, bestGame: 7 },
        { type: "ADJECTIVE_RAIN", status: "WON", count: 9, averageGuesses: 1, bestGame: 1 },
      ],
      [],
      [],
    );

    expect(stats.geography.IRAN_CITY).toEqual({
      total: 3,
      wins: 2,
      surrendered: 1,
      averageGuesses: 4.5,
      bestGame: 3,
    });
    expect(stats.geography.COUNTRY).toEqual({
      total: 1,
      wins: 1,
      surrendered: 0,
      averageGuesses: 7,
      bestGame: 7,
    });
    expect(stats.semantris).toEqual({ games: 0, totalScore: 0, bestScore: null });
    expect(stats.letterDuel).toEqual({
      rounds: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: null,
    });
    expect(stats.phraseHunt).toEqual({ games: 0, wins: 0, surrendered: 0, bestScore: null });
  });

  it("includes active Semantris scores and counts completed Duel outcomes", () => {
    const stats = buildPublicProfileStats(
      [],
      [40, 125, 0],
      [
        { status: "WON", count: 6 },
        { status: "LOST", count: 3 },
        { status: "DRAW", count: 1 },
      ],
    );

    expect(stats.semantris).toEqual({ games: 3, totalScore: 165, bestScore: 125 });
    expect(stats.letterDuel).toEqual({
      rounds: 10,
      wins: 6,
      losses: 3,
      draws: 1,
      winRate: 0.6,
    });
    expect(stats.phraseHunt).toEqual({ games: 0, wins: 0, surrendered: 0, bestScore: null });
  });
});
