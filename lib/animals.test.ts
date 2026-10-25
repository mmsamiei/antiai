import { describe, expect, it } from "vitest";
import { animalDistance, animalProximityRank } from "./animals";
import { animalRecords, animalCladeSizes } from "./data/animals";
import { datasetFor, proximityRank, searchItems } from "./geo";
import { publicProximityRank, serializeGame } from "./game-service";
import { countryChallengeWindow } from "./country-challenge-schedule";

const id = (name: string) => animalRecords.find(a => a.name === name)!.id;
describe("animal game data and rankings", () => {
  it("only exposes the 263 distinct animal leaves, without geographic coordinates", () => {
    expect(datasetFor("ANIMAL")).toHaveLength(263);
    expect(new Set(animalRecords.map(a => a.id)).size).toBe(263);
    expect(datasetFor("ANIMAL").every(a => a.latitude === undefined && a.longitude === undefined)).toBe(true);
    expect(searchItems("ANIMAL", "گربه").some(a => a.name === "گربه خانگی")).toBe(true);
    expect(searchItems("ANIMAL", "گربه‌سان")).toEqual([]);
    expect(searchItems("ANIMAL", "ایران")).toEqual([]);
  });
  it("has symmetric distances, exact-answer zero, and strictly positive distances otherwise", () => {
    for (let i = 0; i < animalRecords.length; i++) for (let j = 0; j < animalRecords.length; j++) {
      expect(animalCladeSizes[i][j]).toBe(animalCladeSizes[j][i]);
      expect(i === j ? animalCladeSizes[i][j] === 0 : animalCladeSizes[i][j] > 0).toBe(true);
    }
    expect(animalDistance(id("شیر"), id("جگوار"))).toBeCloseTo(Math.log2(7));
  });
  it("keeps related sharks closer than mammals, unlike raw edge counts", () => {
    const target = id("کوسه سفید بزرگ");
    expect(animalDistance(id("کوسه آبی"), target)).toBeLessThan(animalDistance(id("نوک‌اردکی"), target));
    expect(animalProximityRank(id("کوسه آبی"), target)).toBe(animalProximityRank(id("کوسه نهنگ"), target));
  });
  it("publishes logarithmic animal distance while preserving rank only for ordering", () => {
    const target = id("شیر"), guess = id("گربه خانگی"), createdAt = new Date();
    const game = {
      id: "animal-game", userId: "user", type: "ANIMAL", targetId: target,
      datasetVersion: "test", status: "ACTIVE", guessesCount: 1, startedAt: createdAt,
      finishedAt: null, guesses: [{ id: "guess", gameId: "animal-game", itemId: guess,
        rank: animalProximityRank(guess, target) + 1, createdAt }],
      semantrisState: null, letterDuelRoundId: null, duelOwnScore: null, duelOpponentScore: null,
      phraseChallengeId: null,
    } as unknown as Parameters<typeof serializeGame>[0];
    const serialized = serializeGame(game) as { guesses: { rank: number; distance?: number }[] };
    expect(serialized.guesses[0].rank).toBeGreaterThan(0);
    expect(serialized.guesses[0].distance).toBe(animalDistance(guess, target));
  });
  it("preserves ties and reserves public zero for the exact target, with other ranks starting at two", () => {
    const animals = datasetFor("ANIMAL"), target = animals.find(a => a.name === "شیر")!;
    expect(publicProximityRank("ANIMAL", proximityRank("ANIMAL", target, target))).toBe(0);
    const ranks = animals.filter(a => a.id !== target.id).map(a => publicProximityRank("ANIMAL", proximityRank("ANIMAL", a, target)));
    expect(Math.min(...ranks)).toBe(2);
    expect(publicProximityRank("ANIMAL", animalProximityRank(id("گربه خانگی"), target.id)))
      .toBe(publicProximityRank("ANIMAL", animalProximityRank(id("گربه پالاس"), target.id)));
    expect(() => animalDistance("invalid", target.id)).toThrow();
  });
  it("changes animal challenges at exactly 09:00 and 21:00 Tehran", () => {
    expect(countryChallengeWindow(new Date("2026-10-25T05:29:59.999Z"), "ANIMAL").id).toBe("2026-10-24T17:30:00.000Z");
    expect(countryChallengeWindow(new Date("2026-10-25T05:30:00.000Z"), "ANIMAL").id).toBe("2026-10-25T05:30:00.000Z");
    expect(countryChallengeWindow(new Date("2026-10-25T17:30:00.000Z"), "ANIMAL").id).toBe("2026-10-25T17:30:00.000Z");
  });
});
