import { mkdir, readFile, writeFile } from "node:fs/promises";
const exclusions = JSON.parse(await readFile(new URL("../lib/data/letter-duel-exclusions.json", import.meta.url), "utf8"));
const sources = [
  ["https://raw.githubusercontent.com/b00f/lilak/master/src/data/lexicon", (line) => line.startsWith("#") ? "" : line.split(",")[0]],
  ["https://raw.githubusercontent.com/b00f/lilak/master/src/data/dic_users", (line) => line.startsWith("#") ? "" : line],
  ["https://raw.githubusercontent.com/mvalipour/word-list-fa/master/words.txt", (line) => line]
];
function normalize(value) { return value.normalize("NFKC").toLocaleLowerCase("fa").replaceAll("ي", "ی").replaceAll("ى", "ی").replaceAll("ك", "ک").replace(/[أإٱ]/g, "ا").replaceAll("ة", "ه").replace(/[\u064b-\u065f\u0670]/g, "").replace(/[ـ‌]/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim(); }
const words = new Set();
const excluded = new Set(exclusions.map(entry => normalize(entry.word)));
// Apply a review to the existing snapshot without refreshing unrelated upstream data.
if (process.argv.includes("--from-existing")) {
  const file = "lib/data/letter-duel-lexicon.txt";
  const existing = await readFile(file, "utf8");
  const lines = existing.split(/\r?\n/);
  const retained = lines.filter(line => !excluded.has(normalize(line)));
  await writeFile(file, retained.join("\n"));
  console.log(`Removed ${lines.length - retained.length} reviewed entries.`);
  process.exit(0);
}
for (const [url, parse] of sources) { const response = await fetch(url); if (!response.ok) throw new Error(`Could not fetch ${url}`); for (const line of (await response.text()).split(/\r?\n/)) { const word = normalize(parse(line)); if (word && !word.includes(" ") && /^[\u0600-\u06ff]+$/u.test(word)) words.add(word); } }
for (const word of excluded) words.delete(word);
await mkdir("lib/data", { recursive: true });
await writeFile("lib/data/letter-duel-lexicon.txt", ["# Generated from Lilak (Apache-2.0) and word-list-fa (MIT).", "# Do not edit manually; run npm run data:letter-duel.", ...[...words].sort((a, b) => a.localeCompare(b, "fa"))].join("\n") + "\n");
console.log(`Generated ${words.size} normalized Persian words.`);
