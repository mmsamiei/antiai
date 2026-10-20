import type { GameType } from "@prisma/client";
import { countries } from "./data/countries";
import { iranCities } from "./data/iran-cities";
import { countryDescriptions } from "./data/country-descriptions";

export type GeoItem = {
  id: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  emoji?: string;
  detail?: string;
  provinceName?: string;
};

export type GameItem = GeoItem;

export const DATASET_VERSION = "2026-10-06-iran-admin-v3.1.2";

export { normalizePersian } from "./normalize-persian";
import { normalizePersian } from "./normalize-persian";

export function datasetFor(type: GameType): GameItem[] {
  if (type === "IRAN_CITY") return iranCities;
  if (type === "COUNTRY") return countries;
  return [];
}

export function findItem(type: GameType, id: string): GameItem | undefined {
  return datasetFor(type).find((item) => item.id === id);
}

export function searchItems(type: GameType, rawQuery: string, limit = 8): GameItem[] {
  const query = normalizePersian(rawQuery);
  if (!query) return [];
  return datasetFor(type)
    .map((item) => {
      const names = [item.name, ...item.aliases].map(normalizePersian);
      const exact = names.some((name) => name === query);
      const starts = names.some((name) => name.startsWith(query));
      const contains = names.some((name) => name.includes(query));
      return { item, score: exact ? 0 : starts ? 1 : contains ? 2 : 99 };
    })
    .filter(({ score }) => score < 99)
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, "fa"))
    .slice(0, limit)
    .map(({ item }) => item);
}

export function haversineDistance(a: GeoItem, b: GeoItem): number {
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
