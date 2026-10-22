export function eloResult(one: number, two: number, score: number) {
  const change = Math.round(32 * (score - 1 / (1 + 10 ** ((two - one) / 400))));
  return { one: one + change, two: two - change };
}
