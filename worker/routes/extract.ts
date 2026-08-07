import type { ExtractResponse } from "../../shared/api";
import { parseAppleNewsUrl } from "../../shared/apple-news-url";
import type { Env } from "../cloudflare";
import { cacheGet, cachePut } from "../lib/cache";
import { errorResponse } from "../lib/errors";
import { isBlockedStatus, MIN_TEXT_LENGTH } from "../lib/extract/detect";
import { extractArticle, type ExtractedArticle } from "../lib/extract/extract";
import { extractJsonLdArticle } from "../lib/extract/json-ld";
import { fetchWithTimeout, readTextCapped } from "../lib/http";
import { resolveArticle, type Deps } from "../lib/resolve-article";
import { findWaybackSnapshot } from "../lib/wayback";

const PAGE_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1_500_000;
const EXTRACT_TTL_SECONDS = 86_400;

interface Attempt {
  article: ExtractedArticle;
  finalUrl: string;
}

async function attemptExtraction(
  deps: Deps,
  url: string,
): Promise<Attempt | null> {
  let response: Response;
  try {
    response = await fetchWithTimeout(deps.fetch, url, PAGE_TIMEOUT_MS);
  } catch {
    return null; // timeouts and network errors just fail this attempt
  }

  if (isBlockedStatus(response.status) || !response.ok) return null;

  const html = await readTextCapped(response, MAX_BODY_BYTES);
  const finalUrl = response.url || url;

  // Fast path: many publishers ship the full body in JSON-LD, which is far
  // cheaper to read than a Readability parse. Fall through when it is absent
  // or too short — JSON-LD often omits subheads and captions.
  const fromJsonLd = extractJsonLdArticle(html, finalUrl);
  if (fromJsonLd && fromJsonLd.textLength >= MIN_TEXT_LENGTH) {
    return { article: fromJsonLd, finalUrl };
  }

  const article = extractArticle(html, finalUrl);
  if (!article || article.textLength < MIN_TEXT_LENGTH) return null;

  return { article, finalUrl };
}

export async function handleExtract(
  request: Request,
  env: Env,
  deps: Deps,
): Promise<Response> {
  const input = new URL(request.url).searchParams.get("url") ?? "";
  const parsed = parseAppleNewsUrl(input);
  if (!parsed) {
    return errorResponse("invalid_url", "Not an Apple News link");
  }

  const cacheKey = `extract/${parsed.id}`;
  const cached = await cacheGet(deps.cache, cacheKey);
  if (cached) return cached;

  const resolved = await resolveArticle(parsed, env, deps);
  if (!resolved.ok) {
    return errorResponse(resolved.code, resolved.message);
  }
  const canonicalUrl = resolved.data.canonicalUrl;
  if (!canonicalUrl) {
    return errorResponse(
      "no_canonical",
      "This article has no publisher website to extract from",
    );
  }

  let source: ExtractResponse["source"] = "publisher";
  let attempt = await attemptExtraction(deps, canonicalUrl);

  if (!attempt) {
    const snapshotUrl = await findWaybackSnapshot(
      deps.fetch,
      env,
      canonicalUrl,
    );
    if (snapshotUrl) {
      source = "wayback";
      attempt = await attemptExtraction(deps, snapshotUrl);
    }
  }

  if (!attempt) {
    return errorResponse(
      "extraction_failed",
      "Could not extract readable article text from the publisher or an archive",
    );
  }

  const body: ExtractResponse = {
    source,
    sourceUrl: attempt.finalUrl,
    ...attempt.article,
  };
  const response = Response.json(body, {
    headers: { "cache-control": "public, max-age=300" },
  });
  cachePut(deps.cache, cacheKey, response, EXTRACT_TTL_SECONDS, deps.waitUntil);
  return response;
}
