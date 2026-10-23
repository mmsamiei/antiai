/** Scores are immutable once persisted. Cache only successful canonical scores. */
export class PhraseHuntScoreCache {
  private entries = new Map<string, { score: number; expires: number }>();
  constructor(private limit = 4096, private ttlMs = 60_000) {}
  get(key: string): number | undefined {
    const row = this.entries.get(key);
    if (!row) return undefined;
    if (Date.now() >= row.expires) { this.entries.delete(key); return undefined; }
    return row.score;
  }
  set(key: string, score: number) {
    this.entries.delete(key);
    this.entries.set(key, { score, expires: Date.now() + this.ttlMs });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
  clear() { this.entries.clear(); }
}

const shared = globalThis as unknown as {
  phraseHuntScoreCache?: PhraseHuntScoreCache;
  phraseHuntPendingScores?: Map<string, Promise<number>>;
};
export const phraseHuntScoreCache = shared.phraseHuntScoreCache ??= new PhraseHuntScoreCache();
export const phraseHuntPendingScores = shared.phraseHuntPendingScores ??= new Map<string, Promise<number>>();
