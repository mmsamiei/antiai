import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.join(projectRoot, "scripts/data/adjective-pilot.json");
const outputPath = path.join(projectRoot, "scripts/data/adjectives-embeddings.json");
const model = process.env.ADJECTIVE_EMBEDDING_MODEL || "google/gemini-embedding-2";
const dimensions = Number(process.env.ADJECTIVE_EMBEDDING_DIMENSIONS || 768);
const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing from .env");

const adjectives = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(adjectives) || adjectives.length === 0) throw new Error("Adjective input is empty");

// Gemini Embedding 2 recommends a consistent sentence-similarity instruction
// for symmetric text comparisons. The adjective itself remains the only data.
const toEmbeddingInput = (word) => `task: sentence similarity | query: صفت فارسی: ${word}`;
const batchSize = 50;
const vectors = [];

for (let index = 0; index < adjectives.length; index += batchSize) {
  const batch = adjectives.slice(index, index + batchSize);
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input: batch.map(toEmbeddingInput), dimensions })
  });
  if (!response.ok) throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const embeddings = [...payload.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  if (embeddings.length !== batch.length || embeddings.some((vector) => vector.length !== dimensions)) {
    throw new Error("Embedding response has an unexpected shape");
  }
  vectors.push(...embeddings);
  console.log(`Embedded ${vectors.length}/${adjectives.length}`);
}

fs.writeFileSync(outputPath, JSON.stringify({ model, dimensions, adjectives, vectors }, null, 2) + "\n");
console.log(`Saved ${adjectives.length} adjective embeddings to ${path.relative(projectRoot, outputPath)}`);
