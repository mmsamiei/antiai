// Anchor each fixed server deadline once; variable polling latency must not
// repeatedly move a running countdown backwards and forwards.
export class RaceCountdown {
  private deadline: string | null = null;
  private endsAt = 0;

  sync(deadline: string | null, serverNow: string, receivedAt: number, roundTripMs: number) {
    if (!deadline || deadline === this.deadline) return;
    const remaining = Date.parse(deadline) - Date.parse(serverNow);
    if (!Number.isFinite(remaining)) return;
    this.deadline = deadline;
    this.endsAt = receivedAt + Math.max(0, remaining - Math.max(0, roundTripMs) / 2);
  }

  seconds(now: number) {
    return this.deadline ? Math.max(0, Math.ceil((this.endsAt - now) / 1000)) : 0;
  }
}
