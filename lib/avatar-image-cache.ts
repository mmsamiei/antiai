import { AsyncCapacity } from "./async-capacity";
export type AvatarImage = { bytes: ArrayBuffer; contentType: string };
const capacity = new AsyncCapacity(12, 128, 3000);
export class AvatarImageCache {
  private entries = new Map<string, { value: AvatarImage; expires: number }>();
  private pending = new Map<string, Promise<AvatarImage>>();
  private bytes = 0;
  constructor(private maxBytes = 20 * 1024 * 1024, private ttl = 300000, private maxEntries = 256) {}
  async get(key: string, load: () => Promise<AvatarImage>): Promise<AvatarImage> {
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) { this.entries.delete(key); this.entries.set(key, cached); return cached.value; }
    if (cached) { this.bytes -= cached.value.bytes.byteLength; this.entries.delete(key); }
    const pending = this.pending.get(key); if (pending) return pending;
    const result = capacity.run(load).then(value => {
      if (value.bytes.byteLength <= this.maxBytes) {
        this.entries.set(key, { value, expires: Date.now() + this.ttl }); this.bytes += value.bytes.byteLength;
        while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value!; this.bytes -= this.entries.get(oldest)!.value.bytes.byteLength; this.entries.delete(oldest);
        }
      }
      return value;
    });
    this.pending.set(key, result);
    try { return await result; } finally { this.pending.delete(key); }
  }
}
export const avatarImageCache = new AvatarImageCache();
