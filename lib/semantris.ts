import { normalizePersian } from "./geo";
import { semantrisCategories, type SemantrisCategory } from "./data/semantris-categories";

export const SEMANTRIS_STARTING_WORDS = 10;
export const SEMANTRIS_MAX_WORDS = 18;
export const SEMANTRIS_DROP_MS = 12_000;
export const SEMANTRIS_WAVE_SIZE = 10;

type SemantrisWave = { categoryId: string; queue: string[]; position: number };
export type SemantrisState = {
  words: string[]; targetWord: string; score: number; cleared: number; moves: number; combo: number; gameOver: boolean; lastDropAt: string; wave: SemantrisWave;
  clues: { word: string; targetWord: string; targetRank: number; removed: number; createdAt: string }[];
  usedClues: string[];
  pendingWords: string[];
};

function shuffle<T>(items: T[]) { return [...items].sort(() => Math.random() - 0.5); }
function categoryById(id: string) { return semantrisCategories.find((category) => category.id === id); }
function createWave(previousId?: string): SemantrisWave {
  const choices = semantrisCategories.filter((category) => category.id !== previousId);
  const category = choices[Math.floor(Math.random() * choices.length)] || semantrisCategories[0];
  return { categoryId: category.id, queue: shuffle(category.words).slice(0, SEMANTRIS_WAVE_SIZE), position: 0 };
}
function allWords() { return semantrisCategories.flatMap((category) => category.words); }
function drawInitialWords(count: number) {
  const categories = shuffle(semantrisCategories); const result: string[] = [];
  for (const category of categories) { const word = shuffle(category.words).find((candidate) => !result.includes(candidate)); if (word) result.push(word); if (result.length === count) return result; }
  return [...result, ...shuffle(allWords()).filter((word) => !result.includes(word)).slice(0, count - result.length)];
}
function drawWaveWord(wave: SemantrisWave, excluded: Set<string>): { word?: string; wave: SemantrisWave } {
  let current = wave;
  for (let attempts = 0; attempts < semantrisCategories.length + 1; attempts++) {
    while (current.position < current.queue.length) { const word = current.queue[current.position++]; if (!excluded.has(word)) return { word, wave: current }; }
    current = createWave(current.categoryId);
  }
  return { word: shuffle(allWords()).find((word) => !excluded.has(word)), wave: current };
}
function fillFromWave(words: string[], wave: SemantrisWave, count: number) {
  let nextWords = [...words]; let nextWave = wave;
  while (nextWords.length < count) { const draw = drawWaveWord(nextWave, new Set(nextWords)); nextWave = draw.wave; if (!draw.word) break; nextWords.unshift(draw.word); }
  return { words: nextWords, wave: nextWave };
}

export function createSemantrisState(): SemantrisState {
  const words = drawInitialWords(SEMANTRIS_STARTING_WORDS); const wave = createWave();
  return { words, targetWord: words[Math.floor(Math.random() * (words.length - 4))], score: 0, cleared: 0, moves: 0, combo: 0, gameOver: false, lastDropAt: new Date().toISOString(), wave, clues: [], usedClues: [], pendingWords: [] };
}
export function semantrisWords(state: SemantrisState) { return state.words; }
export function readSemantrisState(value: unknown): SemantrisState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>; const legacyWords = Array.isArray(raw.columns) ? (raw.columns as unknown[]).flat().filter((word): word is string => typeof word === "string") : [];
  const words = Array.isArray(raw.words) && raw.words.every((word) => typeof word === "string") ? raw.words as string[] : legacyWords;
  if (!words.length) return null;
  const targetWord = typeof raw.targetWord === "string" && words.includes(raw.targetWord) ? raw.targetWord : words[Math.floor(Math.random() * Math.max(1, words.length - 4))];
  const rawWave = raw.wave as Partial<SemantrisWave> | undefined;
  const wave = rawWave && typeof rawWave.categoryId === "string" && Array.isArray(rawWave.queue) && typeof rawWave.position === "number" && categoryById(rawWave.categoryId) ? { categoryId: rawWave.categoryId, queue: rawWave.queue.filter((word): word is string => typeof word === "string"), position: rawWave.position } : createWave();
  const clues = Array.isArray(raw.clues) && "targetWord" in (raw.clues[0] || {}) ? raw.clues as SemantrisState["clues"] : [];
  const usedClues = Array.isArray(raw.usedClues) ? raw.usedClues.filter((word): word is string => typeof word === "string").map(normalizePersian).filter(Boolean) : clues.map((item) => normalizePersian(item.word)).filter(Boolean);
  const pendingWords = Array.isArray(raw.pendingWords) ? raw.pendingWords.filter((word): word is string => typeof word === "string").map(normalizePersian).filter(Boolean) : [];
  return { words, targetWord, score: typeof raw.score === "number" ? raw.score : 0, cleared: typeof raw.cleared === "number" ? raw.cleared : 0, moves: typeof raw.moves === "number" ? raw.moves : 0, combo: typeof raw.combo === "number" ? raw.combo : 0, gameOver: raw.gameOver === true, lastDropAt: typeof raw.lastDropAt === "string" ? raw.lastDropAt : new Date().toISOString(), wave, clues, usedClues, pendingWords };
}
export function publicSemantrisState(state: SemantrisState) { return { words: state.words, targetWord: state.targetWord, score: state.score, cleared: state.cleared, moves: state.moves, combo: state.combo, gameOver: state.gameOver, lastDropAt: state.lastDropAt, clues: state.clues }; }
export type SemantrisClueRejection = "CLUE_INVALID" | "CLUE_ON_BOARD" | "CLUE_REPEATED";
export function semantrisClueRejection(state: SemantrisState, rawClue: string): SemantrisClueRejection | null {
  const clue = normalizePersian(rawClue);
  if (!clue || clue.length > 80 || clue.split(" ").length > 12) return "CLUE_INVALID";
  if (state.words.some((word) => normalizePersian(word) === clue)) return "CLUE_ON_BOARD";
  if (state.usedClues.includes(clue)) return "CLUE_REPEATED";
  return null;
}
export function applySemantrisMove(state: SemantrisState, rawClue: string, rankedWords: string[]) {
  const clue = normalizePersian(rawClue); const rejection = semantrisClueRejection(state, clue); if (rejection) throw new Error(rejection);
  if (rankedWords.length !== state.words.length || new Set(rankedWords).size !== state.words.length || rankedWords.some((word) => !state.words.includes(word))) throw new Error("STATE_CHANGED");
  const targetIndex = rankedWords.indexOf(state.targetWord); const dangerStart = Math.max(0, rankedWords.length - 4); const hit = targetIndex >= dangerStart;
  let words = [...rankedWords]; let wave = state.wave; let removed = 0; let targetWord = state.targetWord;
  if (hit) { removed = targetIndex - dangerStart + 1; words = [...words.slice(0, dangerStart), ...words.slice(targetIndex + 1)]; const filled = fillFromWave(words, wave, SEMANTRIS_STARTING_WORDS); words = filled.words; wave = filled.wave; targetWord = words[Math.floor(Math.random() * Math.max(1, words.length - 4))]; }
  return { words, wave, targetWord, score: state.score + removed * 10, cleared: state.cleared + removed, moves: state.moves + 1, combo: 0, gameOver: state.gameOver, lastDropAt: state.lastDropAt, clues: [...state.clues, { word: clue, targetWord: state.targetWord, targetRank: rankedWords.length - targetIndex, removed, createdAt: new Date().toISOString() }].slice(-8), usedClues: [...state.usedClues, clue], pendingWords: [clue, ...state.pendingWords], hit, removed, targetRank: rankedWords.length - targetIndex, removeStartIndex: hit ? dangerStart : null, removeEndIndex: hit ? targetIndex : null };
}
export function applySemantrisTick(state: SemantrisState, now = new Date()) {
  const last = new Date(state.lastDropAt).getTime(); if (Number.isFinite(last) && now.getTime() - last < SEMANTRIS_DROP_MS) return { ...state, added: false };
  const excluded = new Set(state.words);
  const nextPending = state.pendingWords.find((word) => !excluded.has(word));
  const pendingWords = nextPending ? state.pendingWords.filter((word, index) => index !== state.pendingWords.indexOf(nextPending)) : state.pendingWords.filter((word) => !excluded.has(word));
  const draw = nextPending ? { word: nextPending, wave: state.wave } : drawWaveWord(state.wave, excluded);
  const words = draw.word ? [draw.word, ...state.words] : [...state.words];
  return { ...state, words, wave: draw.wave, pendingWords, lastDropAt: now.toISOString(), gameOver: words.length >= SEMANTRIS_MAX_WORDS, added: Boolean(draw.word) };
}
