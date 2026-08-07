import type { RelatedOutlet } from "../../shared/api";
import { fetchWithTimeout, readTextCapped } from "./http";

// Same-story discovery via Bing News RSS.
//
// This used Google News RSS first, which works from a laptop but returns a 503
// "Sorry..." bot page to Cloudflare Workers — verified from a deployed Worker,
// so the feature was silently inert in production. Bing answers Workers
// normally, and its feed is richer: <News:Source> names the outlet, and the
// real article URL is embedded in the redirect link's `url=` parameter, so we
// can link straight to the story instead of to a scoped search.
//
// Server-side only: bing.com sends no CORS headers for this feed.

const FEED_TIMEOUT_MS = 6_000;
const MAX_BODY_BYTES = 400_000;
const MAX_OUTLETS = 6;

/** Words too common to signal that two headlines describe the same story. */
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "how",
  "why",
  "what",
  "who",
  "will",
  "its",
  "it",
  "this",
  "that",
  "these",
  "those",
  "you",
  "his",
  "her",
  "their",
  "they",
  "has",
  "have",
  "had",
  "not",
  "new",
  "says",
]);

/** Minimum headline-token overlap for a result to count as the same story. */
const MIN_SIMILARITY = 0.15;

function significantTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / new Set([...a, ...b]).size;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const ITEM_TITLE_RE = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
const ITEM_LINK_RE = /<link>([\s\S]*?)<\/link>/i;
const ITEM_SOURCE_RE = /<News:Source[^>]*>([\s\S]*?)<\/News:Source>/i;

/**
 * Bing wraps each result in an apiclick redirect that carries the publisher's
 * real URL in its `url=` parameter. Pull that out so we link to the article
 * rather than bouncing readers through Bing.
 */
function publisherUrlFrom(link: string): string | null {
  const decoded = decode(link);
  const match = /[?&]url=([^&]+)/i.exec(decoded);
  const candidate = match ? safeDecodeUri(match[1]) : decoded;
  if (!candidate || !/^https?:\/\//i.test(candidate)) return null;
  // Never hand back a Bing URL as though it were the publisher's.
  if (/(^|\.)bing\.com$/i.test(hostnameOf(candidate) ?? "")) return null;
  return candidate;
}

function safeDecodeUri(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};

function decode(value: string): string {
  return value
    .replace(/&(#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number(entity.slice(1)));
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .trim();
}

/**
 * Find other outlets covering the same story. Returns an empty array rather
 * than throwing — this is a nice-to-have shown after extraction fails, so a
 * flaky upstream must never break the response.
 */
export async function findRelatedCoverage(
  fetchImpl: typeof fetch,
  title: string,
  originHost: string | null,
  feedOrigin = "https://www.bing.com/news",
): Promise<RelatedOutlet[]> {
  const query = encodeURIComponent(title);
  const url = `${feedOrigin}/search?q=${query}&format=rss`;

  let body: string;
  try {
    const response = await fetchWithTimeout(fetchImpl, url, FEED_TIMEOUT_MS);
    if (!response.ok) return [];
    body = await readTextCapped(response, MAX_BODY_BYTES);
  } catch {
    return [];
  }

  const wanted = significantTokens(title);
  const seen = new Set<string>();
  const outlets: RelatedOutlet[] = [];

  for (const chunk of body.split("<item>").slice(1)) {
    const itemTitle = decode(ITEM_TITLE_RE.exec(chunk)?.[1] ?? "");
    const link = ITEM_LINK_RE.exec(chunk)?.[1];
    if (!itemTitle || !link) continue;

    const articleUrl = publisherUrlFrom(link);
    if (!articleUrl) continue;

    const host = hostnameOf(articleUrl);
    if (!host || host === originHost || seen.has(host)) continue;
    if (similarity(wanted, significantTokens(itemTitle)) < MIN_SIMILARITY) {
      continue;
    }

    seen.add(host);
    outlets.push({
      outlet: decode(ITEM_SOURCE_RE.exec(chunk)?.[1] ?? "") || host,
      host,
      title: itemTitle,
      url: articleUrl,
    });
    if (outlets.length >= MAX_OUTLETS) break;
  }

  return outlets;
}
