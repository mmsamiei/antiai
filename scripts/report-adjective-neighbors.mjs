import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.join(projectRoot, "scripts/data/adjectives-embeddings.json");
const { adjectives, vectors } = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const cosine = (a, b) => {
  let dot = 0; let aNorm = 0; let bNorm = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]; aNorm += a[index] ** 2; bNorm += b[index] ** 2;
  }
  return dot / Math.sqrt(aNorm * bNorm);
};

const examples = ["ترسناک", "شاد", "غمگین", "گرم", "خوب", "مخوف", "زیبا", "سریع", "مبهم", "شجاع"];
for (const word of examples) {
  const targetIndex = adjectives.indexOf(word);
  if (targetIndex < 0) continue;
  const neighbors = adjectives
    .map((candidate, index) => ({ candidate, score: cosine(vectors[targetIndex], vectors[index]) }))
    .filter((item) => item.candidate !== word)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  console.log(`\n${word}: ${neighbors.map(({ candidate, score }) => `${candidate} (${score.toFixed(3)})`).join(" · ")}`);
}
