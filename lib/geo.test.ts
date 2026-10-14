import { describe, expect, it } from "vitest";
import { haversineDistance, normalizePersian, proximityRank, publicItem, searchItems } from "./geo";
import { countries } from "./data/countries";
import { iranCities } from "./data/iran-cities";
import { countryDescriptions } from "./data/country-descriptions";
import { canResumeActiveGame, publicProximityRank } from "./game-service";

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

  it("contains exactly the audited official Iran city set", () => {
    expect(iranCities).toHaveLength(1461);
    expect(new Set(iranCities.map((item) => item.id)).size).toBe(1461);
    expect(new Set(iranCities.map((item) => `${item.latitude},${item.longitude}`)).size).toBe(1461);
    expect(iranCities.every((item) => item.provinceName && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))).toBe(true);
    expect(iranCities.some((item) => /[0-9۰-۹]\s*$/.test(item.name))).toBe(false);
  });

  it("excludes neighborhoods and disambiguates same-name cities by province", () => {
    expect(searchItems("IRAN_CITY", "عین دو")).toEqual([]);
    const sardasht = searchItems("IRAN_CITY", "سردشت");
    expect(sardasht).toHaveLength(4);
    expect(new Set(sardasht.map((item) => item.provinceName)).size).toBe(4);
    expect(publicItem(sardasht[0])).toHaveProperty("provinceName");
  });

  it("keeps the target outside proximity ranks", () => {
    const target = searchItems("IRAN_CITY", "تهران")[0];
    expect(target).toBeTruthy();
    expect(proximityRank("IRAN_CITY", target, target)).toBe(0);
  });

  it("uses rank 1 for the nearest different city", () => {
    const target = searchItems("IRAN_CITY", "زارچ")[0];
    const ashkezar = searchItems("IRAN_CITY", "اشکذر")[0];
    expect(target?.name).toBe("زارچ");
    expect(ashkezar?.name).toBe("اشکذر");
    expect(proximityRank("IRAN_CITY", ashkezar, target)).toBe(1);
  });
  it("does not resume an Iran-city game whose legacy target was removed", () => {
    expect(canResumeActiveGame("IRAN_CITY", "removed-legacy-city")).toBe(false);
    expect(canResumeActiveGame("IRAN_CITY", iranCities[0].id)).toBe(true);
  });

});


describe("public country ranks and descriptions", () => {
  it("keeps stored ranks intact while country ranks display from 2", () => {
    expect(publicProximityRank("COUNTRY", 0)).toBe(0);
    expect(publicProximityRank("COUNTRY", 1)).toBe(2);
    expect(publicProximityRank("IRAN_CITY", 0)).toBe(0);
    expect(publicProximityRank("IRAN_CITY", 1)).toBe(2);
  });

  it("has a non-empty local description for every country and no extras", () => {
    const ids = new Set(countries.map((item) => item.id));
    expect(Object.keys(countryDescriptions)).toHaveLength(countries.length);
    expect(Object.values(countryDescriptions).every((description) => description.trim().length > 0)).toBe(true);
    expect(Object.keys(countryDescriptions).every((id) => ids.has(id))).toBe(true);
  });

  it("does not expose country descriptions until the answer is revealed", () => {
    const country = countries[0];
    expect(publicItem(country)).not.toHaveProperty("description");
    expect(publicItem(country, true).description).toBe(countryDescriptions[country.id]);
  });
});
