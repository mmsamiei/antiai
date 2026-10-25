import { animalCladeSizes, animalRecords } from "./data/animals";

const indices = new Map(animalRecords.map((animal, index) => [animal.id, index]));
const rankCache = new Map<string, number[]>();

export function animalDistance(guessId: string, targetId: string) {
  const guess = indices.get(guessId), target = indices.get(targetId);
  if (guess === undefined || target === undefined) throw new Error("Unknown animal");
  const count = animalCladeSizes[guess][target];
  return count === 0 ? 0 : Math.log2(count);
}

/** Internal ranks start at 1; the existing public serializer adds 1. Ties stay tied. */
export function animalProximityRank(guessId: string, targetId: string) {
  const guess = indices.get(guessId), target = indices.get(targetId);
  if (guess === undefined || target === undefined) throw new Error("Unknown animal");
  let ranks = rankCache.get(targetId);
  if (!ranks) {
    const distances = animalCladeSizes[target];
    ranks = distances.map((distance, index) => index === target ? 0 :
      1 + distances.filter((other, j) => j !== target && other < distance).length);
    rankCache.set(targetId, ranks);
  }
  return ranks[guess];
}
