import { animalRecords } from "./data/animals";
import { animalProximityRank } from "./animals";
import type { GameType } from "@prisma/client";
import { countries } from "./data/countries";
import { iranCities } from "./data/iran-cities";
import { countryDescriptions } from "./data/country-descriptions";

export type GeoItem = {
  id: string;
  name: string;
  aliases: string[];
  latitude?: number;
  longitude?: number;
  emoji?: string;
  detail?: string;
  provinceName?: string;
};

export type GameItem = GeoItem;
const animals: GameItem[] = animalRecords.map(a => ({ id: a.id, name: a.name, aliases: a.aliases, emoji: "🐾", detail: a.scientific }));

export const DATASET_VERSION = "2026-10-06-iran-admin-v3.1.2";

export { normalizePersian } from "./normalize-persian";
import { normalizePersian } from "./normalize-persian";

export function datasetFor(type: GameType): GameItem[] {
  if (type === "ANIMAL") return animals;
  if (type === "IRAN_CITY") return iranCities;
  if (type === "COUNTRY") return countries;
  return [];
}

export function findItem(type: GameType, id: string): GameItem | undefined {
  return datasetFor(type).find((item) => item.id === id);
}

const searchCollator = new Intl.Collator("fa");
const searchIndex = new Map<GameType, { item: GameItem; names: string[] }[]>(
  (["IRAN_CITY", "COUNTRY", "ANIMAL"] as const).map(type => [type, datasetFor(type).map(item => ({
    item, names: [item.name, ...item.aliases].map(normalizePersian),
  }))]),
);
const searchCache = new Map<string, GameItem[]>();
const SEARCH_CACHE_LIMIT = 256;

export function searchItems(type: GameType, rawQuery: string, limit = 8): GameItem[] {
  const query = normalizePersian(rawQuery);
  if (!query) return [];
  const key = JSON.stringify([type, query, limit]);
  const cached = searchCache.get(key);
  if (cached) return cached.slice();
  const matches = (searchIndex.get(type) || [])
    .map(({ item, names }) => {
      const exact = names.some(name => name === query);
      const starts = names.some(name => name.startsWith(query));
      const contains = names.some(name => name.includes(query));
      return { item, score: exact ? 0 : starts ? 1 : contains ? 2 : 99 };
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || searchCollator.compare(a.item.name, b.item.name))
    .slice(0, limit)
    .map(({ item }) => item);
  if (searchCache.size >= SEARCH_CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value!);
  searchCache.set(key, matches);
  return matches.slice();
}

export function haversineDistance(a: GeoItem, b: GeoItem): number {
  if (a.latitude === undefined || a.longitude === undefined || b.latitude === undefined || b.longitude === undefined) throw new Error("Coordinates required");
  const radius = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function proximityRank(type: GameType, guess: GameItem, target: GameItem): number {
  // The exact answer is intentionally kept outside the proximity ranks. Rank 1
  // therefore always means the nearest *other* place to the hidden answer.
  if (guess.id === target.id) return 0;
  if (type === "ANIMAL") return animalProximityRank(guess.id, target.id);
  if (type !== "IRAN_CITY" && type !== "COUNTRY") throw new Error("No proximity ranks for this game type");
  const distance = haversineDistance(guess, target);
  return 1 + datasetFor(type).filter((item) => item.id !== target.id && haversineDistance(item, target) < distance - 1e-9).length;
}

export function publicItem(item: GameItem, includeDescription = false) {
  return {
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    detail: item.detail,
    provinceName: item.provinceName,
    ...(includeDescription && countryDescriptions[item.id] ? { description: countryDescriptions[item.id] } : {})
  };
}
