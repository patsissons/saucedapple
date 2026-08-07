import type { RelatedOutlet } from "../../shared/api";
import { fetchWithTimeout, readTextCapped } from "./http";

// Same-story discovery. Google News RSS names each result's publisher in a
// <source url="..."> element, so we get the outlet without decoding Google's
// opaque redirect links (research/probes/06-same-story). Server-side only:
// news.google.com sends no CORS headers, so the browser cannot do this.

const GOOGLE_NEWS_TIMEOUT_MS = 6_000;
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
const SOURCE_RE = /<source[^>]+url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i;

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
  feedOrigin = "https://news.google.com/rss",
): Promise<RelatedOutlet[]> {
  const query = encodeURIComponent(title);
  const url = `${feedOrigin}/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  let body: string;
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      GOOGLE_NEWS_TIMEOUT_MS,
    );
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
    const source = SOURCE_RE.exec(chunk);
    if (!itemTitle || !source) continue;

    const host = hostnameOf(source[1]);
    if (!host || host === originHost || seen.has(host)) continue;
    if (similarity(wanted, significantTokens(itemTitle)) < MIN_SIMILARITY) {
      continue;
    }

    seen.add(host);
    outlets.push({
      outlet: decode(source[2]) || host,
      host,
      title: itemTitle,
      // Link to the outlet's own coverage via a scoped Google News search;
      // the per-item links are opaque Google redirects.
      url: `https://news.google.com/search?q=${encodeURIComponent(`${title} site:${host}`)}`,
    });
    if (outlets.length >= MAX_OUTLETS) break;
  }

  return outlets;
}
