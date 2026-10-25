import { readFileSync, writeFileSync } from "node:fs";

const treePath = process.argv[2];
if (!treePath) {
  throw new Error("Usage: node scripts/build-animal-distance-matrix.mjs <labelled_supertree.tre>");
}

const dataPath = new URL("./data/animals-v1.json", import.meta.url);
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const records = data.animals;
const size = records.length;
const indexByOtt = new Map(records.map((animal, index) => [Number(animal.id.slice(3)), index]));
if (indexByOtt.size !== size) throw new Error("Animal OTT IDs must be unique");

const cladeSizes = new Uint32Array(size * size);
const found = new Set();
const stack = [];
const tree = readFileSync(treePath, "utf8");
let token = "";
let skipBranchLength = false;
let justClosed = false;
let closedFrame = null;

function setFirstMrcaSize(indices, tips) {
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) {
      const left = indices[i], right = indices[j];
      const offset = left * size + right;
      if (cladeSizes[offset] === 0) {
        cladeSizes[offset] = tips;
        cladeSizes[right * size + left] = tips;
      }
    }
  }
}

function ottIndex(label) {
  const match = /^ott(\d+)$/.exec(label);
  return match ? indexByOtt.get(Number(match[1])) : undefined;
}

function consume(label) {
  if (!label) return;
  if (skipBranchLength) {
    skipBranchLength = false;
    return;
  }

  if (justClosed) {
    justClosed = false;
    const index = ottIndex(label);
    if (index !== undefined) {
      found.add(index);
      if (!closedFrame) throw new Error("Could not associate an internal OTT label with its node");
      // Taxa can be internal nodes (for example, a named species with tips below it).
      setFirstMrcaSize([...closedFrame.selected, index], closedFrame.tips);
      closedFrame.selected.push(index);
      if (stack.length) stack.at(-1).selected.push(index);
    }
    return;
  }

  const index = ottIndex(label);
  if (index !== undefined) {
    found.add(index);
    if (stack.length) stack.at(-1).selected.push(index);
  }
  if (stack.length) stack.at(-1).tips++;
}

for (let position = 0; position < tree.length; position++) {
  const char = tree[position];
  if (char === "(") {
    stack.push({ tips: 0, selected: [] });
    justClosed = false;
    closedFrame = null;
  } else if (char === ")") {
    if (token) { consume(token); token = ""; }
    const frame = stack.pop();
    if (!frame) throw new Error("Malformed Newick tree: unmatched closing parenthesis");
    setFirstMrcaSize(frame.selected, frame.tips);
    if (stack.length) {
      stack.at(-1).tips += frame.tips;
      stack.at(-1).selected.push(...frame.selected);
    }
    closedFrame = frame;
    justClosed = true;
  } else if (char === "," || char === ";") {
    if (token) { consume(token); token = ""; }
    justClosed = false;
    closedFrame = null;
  } else if (char === ":") {
    if (token) { consume(token); token = ""; }
    skipBranchLength = true;
    justClosed = false;
    closedFrame = null;
  } else if (/\s/.test(char)) {
    if (token) { consume(token); token = ""; }
  } else {
    token += char;
  }
}
if (token) consume(token);
if (stack.length) throw new Error("Malformed Newick tree: unmatched opening parenthesis");
if (found.size !== size) {
  const missing = records.filter((_, index) => !found.has(index)).map(animal => animal.id);
  throw new Error(`Some animal OTT IDs do not occur in this tree: ${missing.join(", ")}`);
}

for (let left = 0; left < size; left++) {
  for (let right = 0; right < size; right++) {
    const value = cladeSizes[left * size + right];
    if (left === right ? value !== 0 : value < 2) throw new Error("Invalid or incomplete MRCA matrix");
  }
}

data.cladeSizes = Array.from({ length: size }, (_, row) =>
  Array.from(cladeSizes.subarray(row * size, (row + 1) * size)));
writeFileSync(dataPath, JSON.stringify(data) + "\n");
console.log(`Built ${size} × ${size} MRCA tip-count matrix from ${treePath}`);
