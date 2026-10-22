import { statSync } from "node:fs";
import { join } from "node:path";
import { ResultCache } from "./result-cache";

const cache = new ResultCache(128);
let checkedAt = 0, version = 0;
export const leaderboardCache = {
  clear: () => cache.clear(),
  get<T>(key: string, ttlMs: number, load: () => Promise<T>) {
    // An admin correction can invalidate every web process without a restart.
    if (Date.now() - checkedAt >= 1000 || Date.now() < checkedAt) {
      checkedAt = Date.now();
      let current = 0;
      try { current = statSync(join(process.cwd(), ".runtime", "leaderboard-cache-version")).mtimeMs; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (current !== version) { version = current; cache.clear(); }
    }
    return cache.get(key, ttlMs, load);
  },
};
export const LIVE_BOARD_TTL = 5000;
export const ENDED_BOARD_TTL = 30 * 60 * 1000;
export function challengeBoardTtl(endsAt: Date, now: Date) {
  // Let already-started guess transactions settle before caching final results.
  return +now - +endsAt >= 30000 ? ENDED_BOARD_TTL : LIVE_BOARD_TTL;
}
