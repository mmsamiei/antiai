const stages = new Map<string, { count: number; totalMs: number; maxMs: number; failed: number }>();
let reportedAt = Date.now();
export function recordJudgeTiming(stage: string, ms: number, failed = false) {
  const row = stages.get(stage) || { count: 0, totalMs: 0, maxMs: 0, failed: 0 };
  row.count++; row.totalMs += ms; row.maxMs = Math.max(row.maxMs, ms); if (failed) row.failed++;
  stages.set(stage, row);
  if (Date.now() - reportedAt >= 60000) {
    console.info("phrase_judge_timing", JSON.stringify(Object.fromEntries([...stages].map(([name, r]) => [name, { count: r.count, averageMs: Math.round(r.totalMs / r.count), maxMs: Math.round(r.maxMs), failed: r.failed }]))));
    stages.clear(); reportedAt = Date.now();
  }
}
export async function measureJudge<T>(stage: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now(); let failed = false;
  try { return await work(); } catch (error) { failed = true; throw error; }
  finally { recordJudgeTiming(stage, performance.now() - started, failed); }
}
