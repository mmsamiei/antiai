"use client";

import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { numericToAlpha2 } from "i18n-iso-countries";
import type { Feature, FeatureCollection } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";
import { countries } from "@/lib/data/countries";

type MapGuess = { id: string; name: string; emoji?: string; rank: number };
type MapTarget = { id: string; name: string; emoji?: string } | null;

const WIDTH = 800;
const HEIGHT = 390;
const SMALL_COUNTRIES = new Set([
  "ad", "ag", "bb", "bh", "bn", "cv", "dm", "gd", "kn", "lc", "li",
  "lu", "mc", "mt", "mv", "nr", "pw", "sm", "sg", "to", "tv", "va", "vc"
]);

const topology = worldData as unknown as Topology<{ countries: GeometryCollection }>;
const worldFeatures = (feature(topology, topology.objects.countries) as unknown as FeatureCollection).features
  .map((country) => ({
    country,
    id: numericToAlpha2(String(country.id).padStart(3, "0"))?.toLowerCase() || ""
  }))
  .filter((item) => item.id);
const polygonIds = new Set(worldFeatures.map((item) => item.id));

function mapTone(rank: number, total: number) {
  if (rank === 0) return "perfect";
  const ratio = rank / total;
  if (ratio <= 0.05) return "hot";
  if (ratio <= 0.2) return "warm";
  if (ratio <= 0.5) return "mild";
  return "cold";
}

export default function CountryGuessMap({ guesses, target, total }: { guesses: MapGuess[]; target: MapTarget; total: number }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const projection = useMemo(() => geoNaturalEarth1().fitExtent([[10, 12], [WIDTH - 10, HEIGHT - 12]], {
    type: "FeatureCollection",
    features: worldFeatures.map((item) => item.country)
  } as FeatureCollection), []);
  const path = useMemo(() => geoPath(projection), [projection]);
  const guessById = useMemo(() => new Map(guesses.map((guess) => [guess.id.toLowerCase(), guess])), [guesses]);
  const targetId = target?.id.toLowerCase() || null;
  const selectedGuess = selectedId ? guessById.get(selectedId) : undefined;
  const selectedTarget = selectedId === targetId ? target : null;
  const markers = useMemo(() => countries.filter((country) => {
    const isRelevant = guessById.has(country.id) || country.id === targetId;
    return isRelevant && (SMALL_COUNTRIES.has(country.id) || !polygonIds.has(country.id));
  }), [guessById, targetId]);

  const selectCountry = (id: string) => {
    if (guessById.has(id) || id === targetId) setSelectedId((current) => current === id ? null : id);
  };

  return <section className="country-map-card" aria-label="نقشه حدس‌های کشورجو">
    <div className="country-map-heading">
      <div><b>نقشه حدس‌ها</b><small>هرچه سبزتر، به پاسخ نزدیک‌تر</small></div>
      <span>{guesses.length.toLocaleString("fa-IR")} کشور</span>
    </div>
    <div className="country-map-canvas" dir="ltr">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="نقشه جهان با کشورهای حدس‌زده‌شده">
        <path className="map-sphere" d={path({ type: "Sphere" } as unknown as Feature) || undefined} />
        {worldFeatures.map(({ country, id }) => {
          const guess = guessById.get(id);
          const isTarget = id === targetId;
          const className = isTarget ? "target" : guess ? mapTone(guess.rank, total) : "unknown";
          const label = isTarget ? `پاسخ: ${target?.name}` : guess ? `${guess.name}، رتبه ${guess.rank.toLocaleString("fa-IR")}` : undefined;
          return <path key={String(country.id)} d={path(country as Feature) || undefined} className={`map-country ${className}`} onClick={() => selectCountry(id)} role={label ? "button" : undefined} tabIndex={label ? 0 : undefined} aria-label={label} onKeyDown={(event) => { if (label && (event.key === "Enter" || event.key === " ")) selectCountry(id); }}>
            {label && <title>{label}</title>}
          </path>;
        })}
        {markers.map((country) => {
          const point = projection([country.longitude, country.latitude]);
          const guess = guessById.get(country.id);
          const isTarget = country.id === targetId;
          if (!point) return null;
          const label = isTarget ? `پاسخ: ${target?.name}` : `${guess?.name}، رتبه ${guess?.rank.toLocaleString("fa-IR")}`;
          return <g key={country.id} className="map-marker" transform={`translate(${point[0]} ${point[1]})`} onClick={() => selectCountry(country.id)} role="button" tabIndex={0} aria-label={label} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectCountry(country.id); }}>
            <circle className={`marker-halo ${isTarget ? "target" : mapTone(guess?.rank ?? total, total)}`} r="9" />
            <circle className={`marker-dot ${isTarget ? "target" : mapTone(guess?.rank ?? total, total)}`} r="4" />
            <title>{label}</title>
          </g>;
        })}
      </svg>
    </div>
    <div className="map-legend"><span><i className="cold" />دور</span><span><i className="mild" />متوسط</span><span><i className="warm" />نزدیک</span><span><i className="hot" />خیلی نزدیک</span></div>
    {selectedGuess && <button className="map-selection" onClick={() => setSelectedId(null)}><span>{selectedGuess.emoji} {selectedGuess.name}</span><b>رتبه {selectedGuess.rank === 0 ? "درست" : selectedGuess.rank.toLocaleString("fa-IR")}</b></button>}
    {!selectedGuess && selectedTarget && <button className="map-selection" onClick={() => setSelectedId(null)}><span>{selectedTarget.emoji} {selectedTarget.name}</span><b>پاسخ اصلی</b></button>}
    {target && <div className="map-reveal"><i /> پاسخ اصلی روی نقشه مشخص شد: <b>{target.emoji} {target.name}</b></div>}
  </section>;
}
