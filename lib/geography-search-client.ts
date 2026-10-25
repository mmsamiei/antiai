"use client";
import type { ItemPhoto } from "./item-photo";
import { normalizePersian } from "./normalize-persian";
import { sessionRequest } from "./client-session";
export type GeographySuggestion = { id: string; name: string; emoji?: string; photo?: ItemPhoto; detail?: string; provinceName?: string; description?: string };
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const cache = new Map<string, GeographySuggestion[]>();
const pending = new Map<string, Promise<GeographySuggestion[]>>();
const keyFor = (type: string, query: string) => JSON.stringify([type, normalizePersian(query)]);
export function cachedGeographySearch(type: string, query: string) {
  return cache.get(keyFor(type, query))?.slice();
}
export function fetchGeographySearch(type: string, query: string): Promise<GeographySuggestion[]> {
  const key = keyFor(type, query), cached = cache.get(key);
  if (cached) return Promise.resolve(cached.slice());
  const existing = pending.get(key);
  if (existing) return existing.then(items => items.slice());
  const task = (async () => {
    const response = await fetch(base + "/api/search?type=" + encodeURIComponent(type) + "&q=" + encodeURIComponent(normalizePersian(query)), sessionRequest());
    if (!response.ok) throw new Error("جست‌وجو انجام نشد");
    const data = await response.json();
    const items: GeographySuggestion[] = data.items || [];
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, items);
    return items;
  })();
  pending.set(key, task);
  void task.then(() => pending.delete(key), () => pending.delete(key));
  return task.then(items => items.slice());
}
