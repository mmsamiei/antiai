import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";

const TARGET_COUNT = 200;
const BATCH_SIZE = 25;
const CONCURRENCY = 12;
const sourcePath = new URL("../lib/data/adjective-prompts.ts", import.meta.url);
const generatedPath = new URL("./data/word-bank-additions.json", import.meta.url);
const outputPath = new URL("./data/curated-word-additions.json", import.meta.url);
const themes = [
  "احساس، خلق‌وخو و شخصیت", "کیفیت، ظاهر و ویژگی‌های فیزیکی", "خانه، خانواده و زندگی روزمره",
  "طبیعت، محیط و جانوران", "جامعه، رابطه و رفتار انسانی", "زمان، مکان، کار و آموزش",
  "حرکت و فعالیت بدنی", "فکر، یادگیری و ارتباط", "تغییر، ساختن و مراقبت"
];

const clean = (value) => String(value || "").replaceAll("‌", " ").replace(/\s+/g, " ").trim();
const wordCount = (value) => clean(value).split(" ").filter(Boolean).length;
const source = await readFile(sourcePath, "utf8");
const knownNames = new Set([...source.matchAll(/name: "([^"]+)"/g)].map((match) => clean(match[1])));
for (const prompt of JSON.parse(await readFile(generatedPath, "utf8"))) knownNames.add(clean(prompt.name));

let additions = [];
try { additions = JSON.parse(await readFile(outputPath, "utf8")); } catch { /* first run */ }
for (const prompt of additions) knownNames.add(clean(prompt.name));

function parseJson(text) {
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

async function generateBatch(theme) {
  const prompt = [
    "برای بازی فارسی واژه‌جو، " + BATCH_SIZE + " هدف تازه و باکیفیت بساز.",
    "خروجی فقط JSON array باشد. ساختار هر مورد:",
    '{"name":"واژه یا عبارت فارسی","partOfSpeech":"صفت یا اسم یا فعل","examples":["هم‌معنی دقیق ۱","هم‌معنی دقیق ۲","هم‌معنی دقیق ۳","هم‌معنی دقیق ۴","هم‌معنی دقیق ۵"]}',
    "موضوع این دسته: " + theme,
    "قواعد سخت: هدف حداکثر دو کلمه باشد؛ فقط فارسی معیار و عمومی؛ اسم خاص، اصطلاح فنی، فناوری، وام‌واژهٔ تخصصی، عبارت ساختگی، تکرار صرفی، صفت عامیانه یا توهین‌آمیز نده. فعل‌ها باید مصدر یا عبارت فعلی طبیعی باشند. برای هر هدف ۵ تا ۷ هم‌معنیِ واقعی با همان نقش دستوری بده. هم‌معنیِ مرتبط، متضاد، تعریف توضیحی یا خودِ واژه را نده.",
    "این هدف‌ها از قبل استفاده شده‌اند و نباید تکرار شوند: " + [...knownNames].slice(-350).join("، ")
  ].join("\n");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.2,
      max_tokens: 7000,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }]
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error("Generator " + response.status);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "";
  try {
    const parsed = parseJson(content);
    return Array.isArray(parsed) ? parsed : parsed.items || parsed.words || [];
  } catch {
    return [];
  }
}

async function evaluate(prompt) {
  const questions = {
    target: {
      type: "choice",
      instructions: "Judge whether target_word is a natural, common Persian word or established short phrase appropriate for a general-audience synonym game. Reject invented formations, opaque compounds, technical jargon, grammatical fragments, or offensive terms.",
      criteria: { KEEP: "Natural, common, and suitable.", DROP: "Unsuitable target." }
    }
  };
  prompt.examples.forEach((candidate, index) => {
    questions["candidate_" + index] = {
      type: "choice",
      instructions: "Candidate synonym: «" + candidate + "». Judge strictly whether it is a true Persian synonym or close synonym of target «" + prompt.name + "», with the same part of speech (" + prompt.partOfSpeech + "). Reject associations, explanations, broader/narrower words, antonyms, and different grammatical roles.",
      criteria: { DIRECT: "Natural direct or very close synonym.", ACCEPT: "Defensible close synonym.", REJECT: "Not a close synonym." }
    };
  });
  const response = await fetch(process.env.JEV_API_URL || "https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.JEV_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.JEV_MODEL || "typesafe/jev-1.13", state: { target_word: prompt.name, part_of_speech: prompt.partOfSpeech, language: "Persian" }, questions }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("JEV " + response.status);
  const payload = await response.json();
  if (payload.answers?.target?.choice !== "KEEP") return null;
  const examples = prompt.examples.filter((candidate, index) => ["DIRECT", "ACCEPT"].includes(payload.answers?.["candidate_" + index]?.choice));
  return examples.length >= 3 ? { ...prompt, examples } : null;
}

async function parallelMap(values, fn) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const value = values[cursor++];
      try { results.push(await fn(value)); } catch { results.push(null); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

for (let attempt = 1; additions.length < TARGET_COUNT && attempt <= 100; attempt += 1) {
  const raw = await generateBatch(themes[(attempt - 1) % themes.length]);
  const candidates = [];
  for (const item of raw) {
    const name = clean(item.name);
    const partOfSpeech = clean(item.partOfSpeech);
    const examples = [...new Set((item.examples || []).map(clean).filter((word) => word && word !== name))].slice(0, 7);
    if (!name || knownNames.has(name) || wordCount(name) > 2 || !["صفت", "اسم", "فعل"].includes(partOfSpeech) || examples.length < 5) continue;
    knownNames.add(name);
    candidates.push({ id: "curated-" + String(additions.length + candidates.length + 1).padStart(3, "0"), name, emoji: partOfSpeech === "فعل" ? "↯" : partOfSpeech === "اسم" ? "◈" : "✦", partOfSpeech, examples });
  }
  const evaluated = await parallelMap(candidates, evaluate);
  for (const item of evaluated) {
    if (item && additions.length < TARGET_COUNT) additions.push({ ...item, id: "curated-" + String(additions.length + 1).padStart(3, "0") });
  }
  await writeFile(outputPath, JSON.stringify(additions, null, 2) + "\n");
  console.log("attempt " + attempt + ": " + additions.length + "/" + TARGET_COUNT);
}

if (additions.length !== TARGET_COUNT) throw new Error("Only created " + additions.length + " vetted prompts");
console.log("Wrote " + additions.length + " curated prompts");
