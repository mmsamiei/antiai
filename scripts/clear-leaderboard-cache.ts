import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
mkdirSync(join(process.cwd(), ".runtime"), { recursive: true });
writeFileSync(join(process.cwd(), ".runtime", "leaderboard-cache-version"), String(Date.now()));
console.log("Leaderboard caches will refresh within one second in all web processes");
