export class CapacityError extends Error { constructor() { super("JEV_BUSY"); } }
export class AsyncCapacity {
  private active = 0;
  private waiting: { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  constructor(private limit: number, private maxWaiting: number, private waitMs: number) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) this.active++;
    else {
      if (this.waiting.length >= this.maxWaiting) throw new CapacityError();
      await new Promise<void>((resolve, reject) => {
        const item = { resolve, reject, timer: setTimeout(() => { const i = this.waiting.indexOf(item); if (i >= 0) this.waiting.splice(i, 1); reject(new CapacityError()); }, this.waitMs) };
        this.waiting.push(item);
      });
    }
    try { return await work(); }
    finally { const next = this.waiting.shift(); if (next) { clearTimeout(next.timer); next.resolve(); } else this.active--; }
  }
}
