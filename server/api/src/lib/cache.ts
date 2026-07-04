import { redis } from "./redis";

// Generic read-through cache: returns the cached value if present, otherwise
// computes it, stores it, and returns it. Used for hot, rarely-changing
// reads (public content, institution profile, result lookup, dashboard
// aggregation) to take load off Postgres — never used for anything
// permission-sensitive on its own (callers still run their own auth/access
// checks before reaching the cache lookup).
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit !== null) return JSON.parse(hit) as T;

  const value = await compute();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}

// Wipes an entire cache namespace (e.g. all `content-cache:*` keys) rather
// than tracking exact key-to-content-type mappings — these namespaces are
// small and invalidation only happens on infrequent admin publish actions,
// so a full-namespace flush is simpler and cheap.
export async function invalidateCacheNamespace(prefix: string): Promise<void> {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
}
