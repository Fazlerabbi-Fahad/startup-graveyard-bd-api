/** Minimal in-memory TTL cache. */
export class TtlCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  clear() {
    this.store.clear();
  }

  /** Return the cached value or compute, cache and return it. Concurrent misses share one computation. */
  async wrap(key, compute) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = compute();
    this.set(key, pending);
    try {
      return this.set(key, await pending);
    } catch (err) {
      this.store.delete(key);
      throw err;
    }
  }
}
