// Helpers for worker unit tests (imported by *.test.ts only — never by
// worker runtime code, so none of this ships in the deployed bundle).
import { readFileSync } from "node:fs";
import type { Env } from "./cloudflare";
import type { Deps } from "./routes/resolve";

export function fixture(name: string): string {
  return readFileSync(
    new URL(`./lib/__fixtures__/${name}`, import.meta.url),
    "utf8",
  );
}

/** In-memory stand-in for the Cache API (match/put by URL). */
export class FakeCache {
  store = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.store.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response);
  }

  asCache(): Cache {
    return this as unknown as Cache;
  }
}

export interface FakeUpstream {
  /** Map of URL (or URL prefix ending in *) to response factory. */
  routes: Record<string, () => Response | Promise<Response>>;
  calls: string[];
}

export function makeFetch(upstream: FakeUpstream): typeof fetch {
  return async (input, _init) => {
    const url =
      typeof input === "string" ? input : (input as Request | URL).toString();
    upstream.calls.push(url);
    for (const [pattern, respond] of Object.entries(upstream.routes)) {
      const matches = pattern.endsWith("*")
        ? url.startsWith(pattern.slice(0, -1))
        : url === pattern;
      if (matches) return respond();
    }
    return new Response("not routed", { status: 404 });
  };
}

export function makeDeps(
  upstream: FakeUpstream,
  cache: FakeCache | null = null,
): Deps {
  return {
    fetch: makeFetch(upstream),
    cache: cache?.asCache() ?? null,
    waitUntil: () => {},
  };
}

export const testEnv: Env = {
  ASSETS: { fetch },
  APPLE_NEWS_ORIGIN: "https://apple-news.test",
  WAYBACK_API_ORIGIN: "https://wayback.test",
  WEB_ARCHIVE_ORIGIN: "https://snapshots.test",
  NEWS_FEED_ORIGIN: "https://news.test",
};

export function resolveRequest(url: string | null): Request {
  const base = new URL("https://saucedapple.test/api/resolve");
  if (url !== null) base.searchParams.set("url", url);
  return new Request(base);
}
