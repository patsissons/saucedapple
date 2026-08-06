import type { ResolveResponse } from "../../shared/api";
import { parseAppleNewsUrl } from "../../shared/apple-news-url";
import type { Env } from "../cloudflare";
import { parseAppleNewsPage } from "../lib/apple-news";
import { cacheGet, cachePut } from "../lib/cache";
import { errorResponse } from "../lib/errors";
import { fetchWithTimeout, UpstreamTimeoutError } from "../lib/http";

export interface Deps {
  fetch: typeof fetch;
  cache: Cache | null;
  waitUntil: (promise: Promise<unknown>) => void;
}

const APPLE_NEWS_TIMEOUT_MS = 8_000;
const RESOLVE_TTL_SECONDS = 86_400;

export async function handleResolve(
  request: Request,
  env: Env,
  deps: Deps,
): Promise<Response> {
  const input = new URL(request.url).searchParams.get("url") ?? "";
  const parsed = parseAppleNewsUrl(input);
  if (!parsed) {
    return errorResponse("invalid_url", "Not an Apple News link");
  }

  const cacheKey = `resolve/${parsed.id}`;
  const cached = await cacheGet(deps.cache, cacheKey);
  if (cached) return cached;

  const origin = env.APPLE_NEWS_ORIGIN ?? "https://apple.news";
  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(
      deps.fetch,
      `${origin}/${parsed.id}`,
      APPLE_NEWS_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof UpstreamTimeoutError) {
      return errorResponse("upstream_timeout", "Apple News took too long");
    }
    return errorResponse("upstream_error", "Could not reach Apple News");
  }

  if (upstream.status === 404) {
    return errorResponse("not_found", "No Apple News article with that id");
  }
  if (!upstream.ok) {
    return errorResponse(
      "upstream_error",
      `Apple News responded with ${upstream.status}`,
    );
  }

  const page = parseAppleNewsPage(await upstream.text());
  if (!page) {
    return errorResponse("not_found", "That link is not an Apple News article");
  }

  const body: ResolveResponse = {
    id: parsed.id,
    appleNewsUrl: parsed.url,
    ...page,
  };
  const response = Response.json(body, {
    headers: { "cache-control": "public, max-age=300" },
  });
  cachePut(deps.cache, cacheKey, response, RESOLVE_TTL_SECONDS, deps.waitUntil);
  return response;
}
