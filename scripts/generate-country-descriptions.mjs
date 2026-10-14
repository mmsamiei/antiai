import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const sourcePath = new URL("../scripts/data/country-descriptions.fa.json", import.meta.url);
const datasetPath = new URL("../lib/data/countries.ts", import.meta.url);
const runtimePath = new URL("../lib/data/country-descriptions.ts", import.meta.url);
const model = process.env.COUNTRY_DESCRIPTION_MODEL || "google/gemini-2.5-flash";
const batchSize = 5;
const concurrency = 3;

if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required");
const datasetText = await readFile(datasetPath, "utf8");
const datasetJson = datasetText.slice(datasetText.indexOf(" = [") + 3).replace(/;\s*$/, "");
const countries = JSON.parse(datasetJson).map(({ id, name, detail }) => ({ id, name, capital: detail }));
let records = {};
try { records = JSON.parse(await readFile(sourcePath, "utf8")); } catch { /* resume from an empty source file */ }

function valid(record) {
  if (!record || record.verified !== true || typeof record.description !== "string" || !/[\u0600-\u06ff]/u.test(record.description)) return false;
  const sentences = record.description.split(/[.!؟]+/u).map((part) => part.trim()).filter(Boolean);
  return sentences.length >= 5 && sentences.length <= 6 && Array.isArray(record.sources) && record.sources.length >= 1 && record.sources.every((url) => {
    try { const parsed = new URL(url); return parsed.protocol === "https:" && ["britannica.com", "unesco.org", "nationalgeographic.com", "worldbank.org", "un.org", "gov.qa", "qdl.qa", "gov.ls", "visitlesotho.org.ls", "mfa.lt", "urm.lt", "lithuania.lt", "govt.nz", "newzealand.com", "stats.govt.nz", "dfat.gov.au", "sprep.org", "gov.fm", "itu.int"].some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)); }
    catch { return false; }
  });
}

const missing = countries.filter(({ id }) => !valid(records[id]));
async function generateBatch(batch) {
  const prompt = [
    "برای هر کشور پیوست، معرفی فارسی دقیق در قالب JSON بساز.",
    "هر توضیح دقیقاً ۵ یا ۶ جمله داشته باشد و واقعیت‌های مشخص و متفاوت دربارهٔ جغرافیا، تاریخ و فرهنگ بیاورد. از جملهٔ کلی، اطلاعات زودگذر، ادعای نامطمئن و تکرار میان کشورها پرهیز کن. نام درست فارسی کشور را به کار ببر؛ پایتخت صرفاً برای تشخیص کشور است.",
    "پیش از نوشتن هر معرفی، با جست‌وجوی وب منابع همان کشور را پیدا کن. فقط واقعیت‌هایی را بنویس که از نتایج قابل اتکا پشتیبانی می‌شوند. URL منبع را جعل نکن؛ sources را با URLهای واقعی citationهای جست‌وجو پر کن. برای هر کشور دست‌کم یک منبع مرتبط از Britannica، UNESCO یا سازمان ملل لازم است؛ اگر منبعی پیدا نشد، آن کشور را از خروجی جا بگذار.",
    'فقط JSON با ساختار {"countries":[{"id":"iso2","description":"...","sources":["https://...","https://..."]}]} برگردان.',
    JSON.stringify(batch)
  ].join("\n\n");
  let response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0.1, max_tokens: 7000, max_tool_calls: 5,
        tools: [{ type: "openrouter:web_search", parameters: { max_uses: 5, max_results: 5, max_total_results: 15, allowed_domains: ["britannica.com", "unesco.org", "un.org", "worldbank.org", "nationalgeographic.com"] } }],
        response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }]
      }),
      signal: AbortSignal.timeout(90_000)
    });
    if (response.status !== 429 || attempt >= 3) break;
    await delay(10_000 * (attempt + 1));
  }
  if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status}`);
  const payload = await response.json();
  const message = payload.choices?.[0]?.message || {};
  const content = message.content || "{}";
  let parsed;
  try { parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
  catch {
    console.warn(`Skipping incomplete response for batch ${batch.map(({ id }) => id).join(",")}; it will be retried next run`);
    return [];
  }
  const citedUrls = new Set((message.annotations || [])
    .filter((annotation) => annotation.type === "url_citation")
    .map((annotation) => annotation.url || annotation.url_citation?.url)
    .filter(Boolean)
    .map((url) => { const parsedUrl = new URL(url); parsedUrl.search = ""; parsedUrl.hash = ""; return parsedUrl.toString().replace(/\/$/, ""); }));
  const accepted = [];
  for (const record of parsed.countries || []) {
    if (!batch.some((country) => country.id === record.id)) continue;
    const sources = (record.sources || []).map((url) => {
      try { const parsedUrl = new URL(url); parsedUrl.search = ""; parsedUrl.hash = ""; return parsedUrl.toString().replace(/\/$/, ""); }
      catch { return ""; }
    }).filter((url) => citedUrls.has(url));
    const grounded = { description: record.description, sources: [...new Set(sources)], verified: true };
    if (!valid(grounded)) continue;
    accepted.push([record.id, grounded]);
  }
  return accepted;
}

for (let offset = 0; offset < missing.length; offset += batchSize * concurrency) {
  const batches = Array.from({ length: concurrency }, (_, index) => missing.slice(offset + index * batchSize, offset + (index + 1) * batchSize)).filter((batch) => batch.length);
  const results = await Promise.all(batches.map((batch) => generateBatch(batch).catch((error) => {
    console.warn(`Failed batch ${batch.map(({ id }) => id).join(",")}: ${error instanceof Error ? error.message : "request error"}`);
    return [];
  })));
  for (const rows of results) for (const [id, record] of rows) records[id] = record;
  await writeFile(sourcePath, `${JSON.stringify(records, null, 2)}\n`);
  const done = countries.filter(({ id }) => valid(records[id])).length;
  console.log(`Validated ${done}/${countries.length} country descriptions`);
}

const invalid = countries.filter(({ id }) => !valid(records[id]));
if (invalid.length) throw new Error(`Descriptions still missing or invalid for: ${invalid.map(({ id }) => id).join(", ")}`);
const duplicate = new Map();
for (const country of countries) {
  const normalized = records[country.id].description.replace(/[\s،؛.؟!]/gu, "");
  if (duplicate.has(normalized)) throw new Error(`Duplicate description for ${country.id} and ${duplicate.get(normalized)}`);
  duplicate.set(normalized, country.id);
}
const runtime = Object.fromEntries(countries.map(({ id }) => [id, records[id].description]));
await writeFile(runtimePath, `// Generated by scripts/generate-country-descriptions.mjs from the sourced JSON.\nexport const countryDescriptions: Record<string, string> = ${JSON.stringify(runtime, null, 2)};\n`);
