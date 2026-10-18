// Keep server time anchored to a monotonic browser clock between responses.
export type WordWeaverClock = { serverTime: number; sampledAt: number };

export function sampleWordWeaverClock(serverNow: string, monotonicNow: number): WordWeaverClock {
  return { serverTime: Date.parse(serverNow), sampledAt: monotonicNow };
}

export function remainingWordWeaverSeconds(deadline: string | null, clock: WordWeaverClock | null, monotonicNow: number) {
  if (!deadline || !clock) return 0;
  const serverNow = clock.serverTime + Math.max(0, monotonicNow - clock.sampledAt);
  return Math.max(0, Math.ceil((Date.parse(deadline) - serverNow) / 1000));
}
