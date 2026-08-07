// Minimal ambient types for the Cloudflare Workers surface this project uses.
// Deliberately not @cloudflare/workers-types: its global Request/Response
// declarations conflict with the DOM lib in our single shared tsconfig.

declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}

export interface Env {
  ASSETS: { fetch: typeof fetch };
  APPLE_NEWS_ORIGIN?: string;
  WAYBACK_API_ORIGIN?: string;
  WEB_ARCHIVE_ORIGIN?: string;
  NEWS_FEED_ORIGIN?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
