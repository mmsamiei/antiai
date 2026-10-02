import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../lib/data/adjective-prompts.ts", import.meta.url);
const generatedPath = new URL("./data/word-bank-additions.json", import.meta.url);
const checkpointPath = new URL("./data/jev-synonym-audit.json", import.meta.url);
const rejectedPath = new URL("./data/jev-rejected-synonyms.json", import.meta.url);
const CONCURRENCY = 12;

const source = await readFile(sourcePath, "utf8");
const staticPrompts = [...source.matchAll(/\{ id: "([^"]+)", name: "([^"]+)", emoji: "([^"]+)"(?:, partOfSpeech: "([^"]+)")?, examples: \[([^\]]*)\] \}/g)]
  .map((match) => ({
    id: match[1],
    name: match[2],
    partOfSpeech: match[4] || "صفت",
    examples: [...match[5].matchAll(/"([^"]+)"/g)].map((word) => word[1])
  }));
const generatedPrompts = JSON.parse(await readFile(generatedPath, "utf8"));
const prompts = [...staticPrompts, ...generatedPrompts];

let audit = {};
try {
  audit = JSON.parse(await readFile(checkpointPath, "utf8"));
} catch {
  // First pass.
}

async function auditPrompt(prompt) {
  const questions = Object.fromEntries(prompt.examples.map((candidate, index) => [
    "candidate_" + index,
    {
      type: "choice",
      instructions: "Candidate synonym: «" + candidate + "». Judge strictly whether it is a true Persian synonym or close synonym of target «" + prompt.name + "», with the same part of speech (" + prompt.partOfSpeech + "). Reject words that are merely associated, broader/narrower, antonyms, explanatory phrases, or a different grammatical role.",
      criteria: {
        DIRECT: "Natural direct synonym or very close synonym.",
        ACCEPT: "Defensible close synonym with the same central meaning.",
        REJECT: "Not a close synonym under the stated rules."
      }
    }
  ]));
  const response = await fetch(process.env.JEV_API_URL || "https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.JEV_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || "typesafe/jev-1.13",
      state: { target_word: prompt.name, part_of_speech: prompt.partOfSpeech, language: "Persian" },
      questions
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error("JEV " + response.status);
  const payload = await response.json();
  const answers = payload.answers || {};
  const verdicts = Object.fromEntries(prompt.examples.map((candidate, index) => {
    const choice = answers["candidate_" + index]?.choice;
    if (!["DIRECT", "ACCEPT", "REJECT"].includes(choice)) throw new Error("Missing JEV verdict");
    return [candidate, choice];
  }));
  return verdicts;
}

const remaining = prompts.filter((prompt) => !audit[prompt.id]);
let cursor = 0;
let completedSinceSave = 0;
async function worker() {
  while (cursor < remaining.length) {
    const prompt = remaining[cursor++];
    try {
      audit[prompt.id] = await auditPrompt(prompt);
      completedSinceSave += 1;
      if (completedSinceSave >= 20) {
        completedSinceSave = 0;
        await writeFile(checkpointPath, JSON.stringify(audit, null, 2) + "\n");
        console.log("audited " + Object.keys(audit).length + "/" + prompts.length);
      }
    } catch (error) {
      cursor -= 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await writeFile(checkpointPath, JSON.stringify(audit, null, 2) + "\n");

const rejected = [];
for (const prompt of prompts) {
  for (const [candidate, verdict] of Object.entries(audit[prompt.id] || {})) {
    if (verdict === "REJECT") rejected.push(prompt.id + "|" + candidate);
  }
}
await writeFile(rejectedPath, JSON.stringify(rejected, null, 2) + "\n");
console.log(JSON.stringify({ prompts: prompts.length, rejected: rejected.length }));
