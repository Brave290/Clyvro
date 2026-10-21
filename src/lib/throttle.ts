/**
 * Tiny in-memory sliding-window throttle (per server instance).
 *
 * Good enough as a first line of defence for public endpoints: it never
 * touches the database, and the map is bounded so a flood of distinct
 * keys cannot grow memory without limit. Anything that must hold across
 * instances (serverless functions do not share memory) needs a database
 * claim on top — see `claimPublicTick` in services/dispatch.
 */
export interface Throttle {
  /** Records a hit and returns true when `key` is over its limit. */
  hit(key: string, now?: number): boolean;
  /** Number of keys currently tracked (for tests/diagnostics). */
  size(): number;
}

export function createThrottle(options: { windowMs: number; limit: number; maxKeys?: number }): Throttle {
  const { windowMs, limit } = options;
  const maxKeys = options.maxKeys ?? 5_000;
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      const over = recent.length >= limit;
      if (!over) recent.push(now);
      // Re-insert so the key becomes the most recently used entry.
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return over;
    },
    size() {
      return hits.size;
    },
  };
}

/** Best-effort client address from proxy headers (Vercel sets x-forwarded-for). */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}
