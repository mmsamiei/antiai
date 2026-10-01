import { describe, expect, it } from "vitest";
import { haversineDistance, normalizePersian, proximityRank, searchItems } from "./geo";

describe("Persian normalization", () => {
  it("normalizes Arabic characters and whitespace", () => {
    expect(normalizePersian("  كرج‌ِ بزرگ  ")).toBe("کرج بزرگ");
  });
});

describe("geography engine", () => {
  it("returns zero distance for an identical point", () => {
    const point = { id: "x", name: "x", aliases: [], latitude: 35, longitude: 51 };
    expect(haversineDistance(point, point)).toBe(0);
  });

  it("ranks the target itself first", () => {
    const target = searchItems("IRAN_CITY", "تهران")[0];
    expect(target).toBeTruthy();
    expect(proximityRank("IRAN_CITY", target, target)).toBe(1);
  });
});
