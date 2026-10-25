export type MatchGameType = "COUNTRY" | "IRAN_CITY" | "LETTER_DUEL" | "ANIMAL";
export const matchGameConfig = {
  ANIMAL: { name: "حیوان‌جو", description: "۲۰ ثانیه انتخاب حیوان برای حریف؛ سپس ۲۰۰ ثانیه رقابت", inviteKind: "ANIMAL_RACE" },
  COUNTRY: { name: "کشورجو", description: "یک کشور مشترک، حداکثر ۲۰۰ ثانیه", inviteKind: "COUNTRY_RACE" },
  IRAN_CITY: { name: "شهرجو", description: "یک شهر مشترک، حداکثر ۵ دقیقه", inviteKind: "CITY_RACE" },
  LETTER_DUEL: { name: "دوحرف", description: "واژهٔ حداقل سه‌حرفی بساز؛ اولین نفر با ۱۰ برد، برندهٔ مسابقه است", inviteKind: "LETTER_DUEL" },
} as const;
export function matchGameType(value: string | undefined): MatchGameType { return value === "ANIMAL" ? "ANIMAL" : value === "LETTER_DUEL" ? "LETTER_DUEL" : value === "IRAN_CITY" ? "IRAN_CITY" : "COUNTRY"; }
