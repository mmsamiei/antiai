import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../lib/data/adjective-prompts.ts", import.meta.url);
const generatedPath = new URL("./data/word-bank-additions.json", import.meta.url);
const synonymRejectionsPath = new URL("./data/jev-rejected-synonyms.json", import.meta.url);
const checkpointPath = new URL("./data/jev-target-audit.json", import.meta.url);
const rejectedPath = new URL("./data/jev-rejected-targets.json", import.meta.url);
const allowedThreeWordTargets = new Set(["به پایان رساندن", "به خاطر سپردن", "از سر گرفتن", "برنامه ریزی کردن"]);
const CONCURRENCY = 12;

const source = await readFile(sourcePath, "utf8");
const statics = [...source.matchAll(/\{ id: "([^"]+)", name: "([^"]+)", emoji: "([^"]+)"(?:, partOfSpeech: "([^"]+)")?, examples: \[([^\]]*)\] \}/g)]
  .map((match) => ({ id: match[1], name: match[2], partOfSpeech: match[4] || "صفت", examples: [...match[5].matchAll(/"([^"]+)"/g)].map((word) => word[1]) }));
const generated = JSON.parse(await readFile(generatedPath, "utf8"));
const synonymRejections = new Set(JSON.parse(await readFile(synonymRejectionsPath, "utf8")));
const clean = (value) => value.replaceAll("‌", " ").replace(/\s+/g, " ").trim();
const wordCount = (value) => clean(value).split(" ").length;
const candidates = [...statics, ...generated]
  .map((prompt) => ({ ...prompt, examples: prompt.examples.filter((example) => !synonymRejections.has(prompt.id + "|" + example)) }))
  .filter((prompt) => prompt.examples.length >= 3)
  .filter((prompt) => wordCount(prompt.name) <= 2 || allowedThreeWordTargets.has(clean(prompt.name)));

let audit = {};
try { audit = JSON.parse(await readFile(checkpointPath, "utf8")); } catch { /* first run */ }

async function auditTarget(prompt) {
  const response = await fetch(process.env.JEV_API_URL || "https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.JEV_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || "typesafe/jev-1.13",
      state: { target_word: prompt.name, part_of_speech: prompt.partOfSpeech, language: "Persian" },
      questions: {
        verdict: {
          type: "choice",
          instructions: "Judge whether target_word is a natural, common Persian dictionary word or established Persian phrase appropriate as a target in a general-audience synonym game. Reject invented formations, malformed compounds, overly technical labels, grammatical fragments, and opaque machine-generated phrases. Do not judge its supplied synonyms here.",
          criteria: {
            KEEP: "Natural and suitable general-audience target.",
            DROP: "Unsuitable, unnatural, malformed, overly technical, or opaque target."
          }
        }
      }
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("JEV " + response.status);
  const payload = await response.json();
  const verdict = payload.answers?.verdict?.choice;
  if (!["KEEP", "DROP"].includes(verdict)) throw new Error("Missing JEV verdict");
  return verdict;
}

const remaining = candidates.filter((prompt) => !audit[prompt.id]);
let cursor = 0;
let saved = 0;
async function worker() {
  while (cursor < remaining.length) {
    const prompt = remaining[cursor++];
    try {
      audit[prompt.id] = await auditTarget(prompt);
      saved += 1;
      if (saved >= 25) {
        saved = 0;
        await writeFile(checkpointPath, JSON.stringify(audit, null, 2) + "\n");
        console.log("audited " + Object.keys(audit).length + "/" + candidates.length);
      }
    } catch {
      cursor -= 1;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await writeFile(checkpointPath, JSON.stringify(audit, null, 2) + "\n");
const rejected = candidates.filter((prompt) => audit[prompt.id] === "DROP").map((prompt) => prompt.id);
await writeFile(rejectedPath, JSON.stringify(rejected, null, 2) + "\n");
console.log(JSON.stringify({ candidates: candidates.length, rejected: rejected.length, kept: candidates.length - rejected.length }));
