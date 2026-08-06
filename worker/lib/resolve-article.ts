import type { ErrorCode, ResolveResponse } from "../../shared/api";
import type { AppleNewsRef } from "../../shared/apple-news-url";
import type { Env } from "../cloudflare";
import { parseAppleNewsPage } from "./apple-news";
import { cacheGet, cachePut } from "./cache";
import { fetchWithTimeout, UpstreamTimeoutError } from "./http";

export interface Deps {
  fetch: typeof fetch;
  cache: Cache | null;
  waitUntil: (promise: Promise<unknown>) => void;
}

export type ResolveResult =
  | { ok: true; data: ResolveResponse }
  | { ok: false; code: ErrorCode; message: string };

const APPLE_NEWS_TIMEOUT_MS = 8_000;
const RESOLVE_TTL_SECONDS = 86_400;

/**
 * Fetch and parse the apple.news page for an article, with caching.
 * Shared by /api/resolve (returns it directly) and /api/extract (needs
 * the canonical URL first).
 */
export async function resolveArticle(
  ref: AppleNewsRef,
  env: Env,
  deps: Deps,
): Promise<ResolveResult> {
  const cacheKey = `resolve/${ref.id}`;
  const cached = await cacheGet(deps.cache, cacheKey);
  if (cached) {
    return { ok: true, data: (await cached.json()) as ResolveResponse };
  }

  const origin = env.APPLE_NEWS_ORIGIN ?? "https://apple.news";
  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(
      deps.fetch,
      `${origin}/${ref.id}`,
      APPLE_NEWS_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof UpstreamTimeoutError) {
      return {
        ok: false,
        code: "upstream_timeout",
        message: "Apple News took too long",
      };
    }
    return {
      ok: false,
      code: "upstream_error",
      message: "Could not reach Apple News",
    };
  }

  if (upstream.status === 404) {
    return {
      ok: false,
      code: "not_found",
      message: "No Apple News article with that id",
    };
  }
  if (!upstream.ok) {
    return {
      ok: false,
      code: "upstream_error",
      message: `Apple News responded with ${upstream.status}`,
    };
  }

  const page = parseAppleNewsPage(await upstream.text());
  if (!page) {
    return {
      ok: false,
      code: "not_found",
      message: "That link is not an Apple News article",
    };
  }

  const data: ResolveResponse = { id: ref.id, appleNewsUrl: ref.url, ...page };
  cachePut(
    deps.cache,
    cacheKey,
    Response.json(data),
    RESOLVE_TTL_SECONDS,
    deps.waitUntil,
  );
  return { ok: true, data };
}
