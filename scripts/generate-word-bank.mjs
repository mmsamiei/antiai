import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";

const TARGET_COUNT = 800;
const BATCH_SIZE = 30;
const themes = [
  "صفت‌های احساس و خلق‌وخو", "صفت‌های شخصیت و رفتار", "صفت‌های جسمی و ظاهری", "صفت‌های اندازه، شکل و بافت",
  "صفت‌های زمان، سرعت و مقدار", "صفت‌های کیفیت، ارزش و وضعیت", "صفت‌های اجتماعی و اخلاقی", "صفت‌های علمی و فکری",
  "اسم‌های بدن و سلامت", "اسم‌های خانه و زندگی روزمره", "اسم‌های خوراک و پوشاک", "اسم‌های طبیعت و آب‌وهوا",
  "اسم‌های شهر و رفت‌وآمد", "اسم‌های آموزش و زبان", "اسم‌های هنر و رسانه", "اسم‌های کار و اقتصاد",
  "اسم‌های جامعه و روابط", "اسم‌های زمان و رویداد", "اسم‌های ذهنی و انتزاعی", "اسم‌های ابزار و فناوری",
  "فعل‌های حرکت و جابه‌جایی", "فعل‌های گفت‌وگو و ارتباط", "فعل‌های فکر و یادگیری", "فعل‌های ساختن و تغییر دادن",
  "فعل‌های خانه و مراقبت", "فعل‌های کار و تصمیم‌گیری", "فعل‌های احساس و رابطه", "فعل‌های آغاز، پایان و ادامه"
];
const sourcePath = new URL("../lib/data/adjective-prompts.ts", import.meta.url);
const outputPath = new URL("./data/word-bank-additions.json", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const knownNames = new Set([...source.matchAll(/name: "([^"]+)"/g)].map((match) => match[1].replaceAll("‌", " ").trim()));
let additions = [];
try {
  additions = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  // No checkpoint yet.
}
for (const prompt of additions) knownNames.add(clean(prompt.name));

function clean(value) {
  return String(value || "").replaceAll("‌", " ").replace(/\s+/g, " ").trim();
}

function extractJson(text) {
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

async function generateBatch(theme) {
  const prompt = [
    "برای بازی فارسی «واژه‌جو» دقیقاً " + BATCH_SIZE + " مدخل تازه بساز.",
    "خروجی فقط JSON array باشد، بدون Markdown. هر مدخل این شکل را داشته باشد:",
    '{"name":"واژه یا عبارت فارسی","partOfSpeech":"صفت یا اسم یا فعل","examples":["هم‌معنی دقیق ۱","هم‌معنی دقیق ۲","هم‌معنی دقیق ۳","هم‌معنی دقیق ۴"]}',
    "موضوع این دسته: " + theme,
    "قواعد: فقط واژه‌های رایج فارسی معیار؛ اسم خاص، نام مکان، اصطلاح خیلی تخصصی و شکل صرف‌شده نده. نقش دستوری هم‌معنی‌ها برابر مدخل باشد. هم‌معنی‌ها دقیق باشند، نه مرتبط یا متضاد. هر مدخل ۴ تا ۶ هم‌معنی متفاوت داشته باشد. مدخل را در examples تکرار نکن.",
    "این واژه‌های اخیر را تکرار نکن: " + [...knownNames].slice(-250).join("، ")
  ].join("\n");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.35,
      max_tokens: 5000,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }]
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error("OpenRouter failed: " + response.status);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "";
  try {
    const parsed = extractJson(content);
    return Array.isArray(parsed) ? parsed : parsed.words || parsed.items || [];
  } catch {
    return [];
  }
}

for (let attempt = 1; additions.length < TARGET_COUNT && attempt <= 100; attempt += 1) {
  const theme = themes[(Math.floor(additions.length / BATCH_SIZE) + attempt - 1) % themes.length];
  const batch = await generateBatch(theme);
  for (const raw of batch) {
    const name = clean(raw.name);
    const partOfSpeech = clean(raw.partOfSpeech);
    const examples = [...new Set((raw.examples || []).map(clean).filter((word) => word && word !== name))].slice(0, 6);
    if (!name || knownNames.has(name) || !["صفت", "اسم", "فعل"].includes(partOfSpeech) || examples.length < 4) continue;
    knownNames.add(name);
    additions.push({
      id: "generated-" + String(additions.length + 1).padStart(3, "0"),
      name,
      emoji: partOfSpeech === "فعل" ? "↯" : partOfSpeech === "اسم" ? "◈" : "✦",
      partOfSpeech,
      examples
    });
    if (additions.length === TARGET_COUNT) break;
  }
  await writeFile(outputPath, JSON.stringify(additions, null, 2) + "\n");
  console.log("attempt " + attempt + " (" + theme + "): " + additions.length + "/" + TARGET_COUNT);
}

if (additions.length !== TARGET_COUNT) throw new Error("Only generated " + additions.length + " valid prompts");
await writeFile(outputPath, JSON.stringify(additions, null, 2) + "\n");
console.log("Wrote " + additions.length + " prompts to " + outputPath.pathname);
