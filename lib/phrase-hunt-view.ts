export { normalizePersian } from "./normalize-persian";

export type DisplayPhraseGuess = { id: string; name: string; score: number; createdAt: string };

export function orderPhraseGuesses<T extends DisplayPhraseGuess>(guesses: readonly T[], order: "score" | "recent") {
  return guesses.map((guess, index) => ({ guess, index })).sort((a, b) =>
    (order === "score" ? b.guess.score - a.guess.score : 0)
    || (order === "recent" ? Date.parse(b.guess.createdAt) - Date.parse(a.guess.createdAt) || b.index - a.index : a.index - b.index),
  ).map(({ guess }) => guess);
}

export function hiddenPhraseGuesses(guesses: readonly DisplayPhraseGuess[]) {
  const best = new Set(orderPhraseGuesses(guesses, "score").slice(0, 3).map(guess => guess.id));
  return new Set(guesses.filter(guess => !best.has(guess.id)).map(guess => guess.id));
}

/** Merge a compact guess response without discarding locally loaded history. */
export function mergePhraseGuess(guesses: readonly DisplayPhraseGuess[], guess: DisplayPhraseGuess, bestScore = 0) {
  const existing = guesses.findIndex(item => item.id === guess.id);
  const phraseGuesses = existing < 0 ? [...guesses, guess] : guesses.map((item, index) => index === existing ? guess : item);
  return { phraseGuesses, bestScore: Math.max(bestScore, guess.score, ...guesses.map(item => item.score)) };
}
