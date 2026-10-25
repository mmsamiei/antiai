export type GeoRaceType = "COUNTRY" | "IRAN_CITY" | "ANIMAL";
export const geoRaceConfig = {
  ANIMAL: { title: "حیوان‌جو", icon: "🐾", name: "حیوان‌جوی رقابتی", noun: "حیوان", hint: "نام یک حیوان را جست‌وجو کن…", durationMs: 200_000, durationText: "۲۰۰ ثانیه", inviteKind: "ANIMAL_RACE" },
  COUNTRY: { title: "کشورجو", icon: "🌍", name: "کشورجوی سرعتی", noun: "کشور", hint: "نام یک کشور را جست‌وجو کن…", durationMs: 200_000, durationText: "۲۰۰ ثانیه", inviteKind: "COUNTRY_RACE" },
  IRAN_CITY: { title: "شهرجو", icon: "📍", name: "شهرجوی سرعتی", noun: "شهر", hint: "نام یک شهر را جست‌وجو کن…", durationMs: 300_000, durationText: "۵ دقیقه", inviteKind: "CITY_RACE" },
} as const;
export function geoRaceType(value: string | undefined): GeoRaceType { return value === "ANIMAL" ? "ANIMAL" : value === "IRAN_CITY" ? "IRAN_CITY" : "COUNTRY"; }
