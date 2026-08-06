// Cache API wrapper with synthetic keys. Null-safe so unit tests (node,
// no caches.default) transparently skip caching.

const CACHE_ORIGIN = "https://cache.saucedapple.internal/";

export function getDefaultCache(): Cache | null {
  try {
    return caches.default;
  } catch {
    return null;
  }
}

function cacheKey(key: string): Request {
  return new Request(CACHE_ORIGIN + key);
}

export async function cacheGet(
  cache: Cache | null,
  key: string,
): Promise<Response | null> {
  if (!cache) return null;
  return (await cache.match(cacheKey(key))) ?? null;
}

/**
 * Store a copy of `response` (which must not have a consumed body) under
 * `key` for `ttlSeconds`. The write happens in the background via waitUntil.
 */
export function cachePut(
  cache: Cache | null,
  key: string,
  response: Response,
  ttlSeconds: number,
  waitUntil: (promise: Promise<unknown>) => void,
): void {
  if (!cache) return;
  const stored = new Response(response.clone().body, response);
  stored.headers.set("cache-control", `public, max-age=${ttlSeconds}`);
  waitUntil(cache.put(cacheKey(key), stored));
}
