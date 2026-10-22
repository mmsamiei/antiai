import { serialize } from "node:v8";
/** Bounded, process-local cache for shared data, never personalized responses. */
export class ResultCache {
  private entries = new Map<string, { value: unknown; created: number; expires: number; bytes: number }>();
  private pending = new Map<string, Promise<unknown>>();
  private generation = 0;
  private bytes = 0;
  constructor(private maxEntries = 128, private maxBytes = 32 * 1024 * 1024) {}
  clear() { this.generation++; this.entries.clear(); this.pending.clear(); this.bytes = 0; }
  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now(), entry = this.entries.get(key);
    if (entry && now >= entry.created && now < entry.expires) return structuredClone(entry.value) as T;
    if (entry) { this.bytes -= entry.bytes; this.entries.delete(key); }
    let work = this.pending.get(key) as Promise<T> | undefined;
    if (!work) {
      const generation = this.generation;
      work = Promise.resolve().then(load).then(value => {
        const bytes = serialize(value).byteLength;
        if (generation === this.generation && bytes <= this.maxBytes) {
          this.entries.set(key, { value: structuredClone(value), created: Date.now(), expires: Date.now() + ttlMs, bytes });
          this.bytes += bytes;
          while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
            const oldest = this.entries.keys().next().value!;
            this.bytes -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest);
          }
        }
        return value;
      });
      this.pending.set(key, work);
      const cleanup = () => { if (this.pending.get(key) === work) this.pending.delete(key); };
      void work.then(cleanup, cleanup);
    }
    return structuredClone(await work);
  }
}
