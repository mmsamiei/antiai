export type GeoRaceType = "COUNTRY" | "IRAN_CITY";
export const geoRaceConfig = {
  COUNTRY: { name: "کشورجوی سرعتی", noun: "کشور", hint: "نام یک کشور را جست‌وجو کن…", durationMs: 200_000, durationText: "۲۰۰ ثانیه", inviteKind: "COUNTRY_RACE" },
  IRAN_CITY: { name: "شهرجوی سرعتی", noun: "شهر", hint: "نام یک شهر را جست‌وجو کن…", durationMs: 300_000, durationText: "۵ دقیقه", inviteKind: "CITY_RACE" },
} as const;
export function geoRaceType(value: string | undefined): GeoRaceType { return value === "IRAN_CITY" ? "IRAN_CITY" : "COUNTRY"; }
