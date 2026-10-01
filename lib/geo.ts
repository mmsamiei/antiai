import type { GameType } from "@prisma/client";
import { countries } from "./data/countries";
import { iranCities } from "./data/iran-cities";

export type GeoItem = {
  id: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  emoji?: string;
  detail?: string;
};

export const DATASET_VERSION = "2026-10-01-v1";

export function normalizePersian(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("fa")
    .replaceAll("ي", "ی")
    .replaceAll("ى", "ی")
    .replaceAll("ك", "ک")
    .replace(/[أإٱ]/g, "ا")
    .replaceAll("ة", "ه")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[ـ‌]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function datasetFor(type: GameType): GeoItem[] {
  return type === "IRAN_CITY" ? iranCities : countries;
}

export function findItem(type: GameType, id: string): GeoItem | undefined {
  return datasetFor(type).find((item) => item.id === id);
}

export function searchItems(type: GameType, rawQuery: string, limit = 8): GeoItem[] {
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

export function proximityRank(type: GameType, guess: GeoItem, target: GeoItem): number {
  // The exact answer is intentionally kept outside the proximity ranks. Rank 1
  // therefore always means the nearest *other* place to the hidden answer.
  if (guess.id === target.id) return 0;
  const distance = haversineDistance(guess, target);
  return 1 + datasetFor(type).filter((item) => item.id !== target.id && haversineDistance(item, target) < distance - 1e-9).length;
}

export function publicItem(item: GeoItem) {
  return { id: item.id, name: item.name, emoji: item.emoji, detail: item.detail };
}
