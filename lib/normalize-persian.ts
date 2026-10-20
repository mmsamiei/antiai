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
