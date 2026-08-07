import type { RelatedResponse } from "../../shared/api";
import { parseAppleNewsUrl } from "../../shared/apple-news-url";
import type { Env } from "../cloudflare";
import { cacheGet, cachePut } from "../lib/cache";
import { errorResponse } from "../lib/errors";
import { findRelatedCoverage } from "../lib/related";
import { resolveArticle, type Deps } from "../lib/resolve-article";

const RELATED_TTL_SECONDS = 86_400;
// An empty list is usually "not indexed yet" or a transient upstream problem,
// not a durable fact — caching it for a day would hide coverage that appears
// minutes later. Keep it just long enough to avoid hammering the feed.
const EMPTY_TTL_SECONDS = 300;

/**
 * Other outlets covering the same story. This is the "read elsewhere" rung:
 * it runs after transcript extraction fails, so roughly half of all articles —
 * the ones no free extractor can transcribe — still end somewhere useful
 * instead of a dead end.
 */
export async function handleRelated(
  request: Request,
  env: Env,
  deps: Deps,
): Promise<Response> {
  const input = new URL(request.url).searchParams.get("url") ?? "";
  const parsed = parseAppleNewsUrl(input);
  if (!parsed) {
    return errorResponse("invalid_url", "Not an Apple News link");
  }

  const cacheKey = `related/${parsed.id}`;
  const cached = await cacheGet(deps.cache, cacheKey);
  if (cached) return cached;

  const resolved = await resolveArticle(parsed, env, deps);
  if (!resolved.ok) {
    return errorResponse(resolved.code, resolved.message);
  }

  const { title, canonicalUrl } = resolved.data;
  let originHost: string | null = null;
  if (canonicalUrl) {
    try {
      originHost = new URL(canonicalUrl).hostname.replace(/^www\./, "");
    } catch {
      originHost = null;
    }
  }

  // No headline means nothing to search on — an empty list, not an error.
  const outlets = title
    ? await findRelatedCoverage(
        deps.fetch,
        title,
        originHost,
        env.NEWS_FEED_ORIGIN,
      )
    : [];

  const body: RelatedResponse = { outlets };
  const response = Response.json(body, {
    headers: { "cache-control": "public, max-age=300" },
  });
  cachePut(
    deps.cache,
    cacheKey,
    response,
    outlets.length > 0 ? RELATED_TTL_SECONDS : EMPTY_TTL_SECONDS,
    deps.waitUntil,
  );
  return response;
}
