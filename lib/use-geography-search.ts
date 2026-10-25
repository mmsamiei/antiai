"use client";
import { useEffect, useRef } from "react";
import { cachedGeographySearch, fetchGeographySearch, type GeographySuggestion } from "./geography-search-client";
export function useGeographySearch({ type, query, selected, enabled = true, onResults }: {
  type: string; query: string; selected: boolean; enabled?: boolean; onResults: (items: GeographySuggestion[]) => void;
}) {
  const results = useRef(onResults); results.current = onResults;
  useEffect(() => {
    if (!enabled || selected || !query.trim() || (type !== "COUNTRY" && type !== "IRAN_CITY" && type !== "ANIMAL")) { results.current([]); return; }
    const cached = cachedGeographySearch(type, query);
    if (cached) { results.current(cached); return; }
    let stopped = false;
    results.current([]);
    const timer = setTimeout(() => {
      // Complete superseded requests for reuse, but only display the current query.
      void fetchGeographySearch(type, query).then(items => { if (!stopped) results.current(items); }).catch(() => { if (!stopped) results.current([]); });
    }, 100);
    return () => { stopped = true; clearTimeout(timer); };
  }, [type, query, selected, enabled]);
}
