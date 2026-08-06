// Shared helpers for the discovery probes (P6 same-story, P7 community,
// P8 archive federation). These probes need a SEARCH QUERY (article title) and
// light RSS/JSON parsing, not full extraction — so everything here is
// deliberately regex-grade, not a real XML parser.

import type { CorpusItem } from "./corpus.ts";
import { politeFetch } from "./fetcher.ts";

// ---------------------------------------------------------------------------
// Article-URL filter. publishers.jsonl mixes real articles with homepages,
// section fronts and one feed URL (harvested from RSS <link>s). Discovery
// queries only make sense for articles, so probes P6-P8 share this filter and
// report how many corpus rows it excluded.
// ---------------------------------------------------------------------------

export function isArticleUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const segs = parsed.pathname.split("/").filter(Boolean);
  if (segs.length === 0) return false;
  // ft.com uses opaque /content/<uuid> article ids.
  if (parsed.hostname.endsWith("ft.com") && segs[0] === "content" && segs.length === 2)
    return true;
  // bbc.co.uk uses /news/articles/<opaque-id>.
  if (segs.includes("articles") && /^[a-z0-9]{8,}$/i.test(segs[segs.length - 1]))
    return true;
  // Otherwise require a hyphenated slug with >=4 word tokens somewhere in the
  // path ("finance-and-economics" alone is a section, not an article).
  return segs.some(
    (s) => s.split("-").filter((t) => /[a-z]{2,}/i.test(t)).length >= 4,
  );
}

// ---------------------------------------------------------------------------
// Entity decoding (Algolia comment_text and RSS titles are HTML-escaped).
// ---------------------------------------------------------------------------

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Title resolution. apple.news corpus items carry a title; publisher items do
// not, so recover one from the (baseline-cached) article HTML, falling back to
// the URL slug for hard-403 hosts (wsj/economist). FT's opaque uuid slugs
// yield nothing — that gets recorded honestly as "no usable title".
// ---------------------------------------------------------------------------

export interface ResolvedTitle {
  title: string;
  source: "corpus" | "og:title" | "html-title" | "slug";
  /** Subrequests spent resolving (0 when the corpus already had a title). */
  subrequests: number;
}

const BAD_TITLE =
  /just a moment|attention required|access denied|are you a robot|captcha|page not found|subscribe to read|forbidden|\b40[134]\b/i;

function titleFromHtml(body: string): ResolvedTitle | null {
  const og =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(body) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(body);
  if (og?.[1]) {
    const t = decodeEntities(og[1]).trim();
    if (t.length >= 8 && !BAD_TITLE.test(t))
      return { title: t, source: "og:title", subrequests: 1 };
  }
  const raw = /<title[^>]*>([^<]+)<\/title>/i.exec(body)?.[1];
  if (raw) {
    let t = decodeEntities(raw).trim();
    // Drop a trailing " - Site Name" / " | Site Name" segment when the
    // remainder still looks like a headline.
    const parts = t.split(/ [|–—-] /);
    if (parts.length > 1 && parts.slice(0, -1).join(" ").split(/\s+/).length >= 4)
      t = parts.slice(0, -1).join(" ").trim();
    if (t.length >= 8 && !BAD_TITLE.test(t))
      return { title: t, source: "html-title", subrequests: 1 };
  }
  return null;
}

function titleFromSlug(url: string): string | null {
  const segs = new URL(url).pathname.split("/").filter(Boolean);
  let best: string[] = [];
  for (const seg of segs) {
    const tokens = seg
      .replace(/\.[a-z]+$/i, "")
      .split("-")
      // Drop pure numbers and hex-ish article ids ("3f60e2db", "19799863").
      .filter((t) => /^[a-z]+$/i.test(t) && !/^[0-9a-f]{6,}$/i.test(t));
    if (tokens.length > best.length) best = tokens;
  }
  return best.length >= 4 ? best.join(" ") : null;
}

export async function resolveTitle(item: CorpusItem): Promise<ResolvedTitle | null> {
  if (item.title) return { title: item.title, source: "corpus", subrequests: 0 };
  const url = item.canonicalUrl;
  if (!url) return null;
  try {
    // Same UA+URL as the P0 baseline fetch, so this is a disk-cache hit.
    const res = await politeFetch(url, { ua: "chrome", timeoutMs: 12_000 });
    if (res.ok) {
      const fromHtml = titleFromHtml(res.body);
      if (fromHtml) return fromHtml;
    }
  } catch {
    /* fall through to slug */
  }
  const slug = titleFromSlug(url);
  return slug ? { title: slug, source: "slug", subrequests: 1 } : null;
}

// ---------------------------------------------------------------------------
// Minimal RSS <item> parsing for Google News / Bing News feeds.
// ---------------------------------------------------------------------------

export interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  /** Google News: <source url="...">Name</source>. */
  sourceUrl: string | null;
  sourceName: string | null;
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  if (!m) return null;
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const source = /<source[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i.exec(
      block,
    );
    items.push({
      title: tag(block, "title") ?? "",
      link: tag(block, "link") ?? "",
      pubDate: tag(block, "pubDate"),
      sourceUrl: source ? decodeEntities(source[1]) : null,
      sourceName: source ? decodeEntities(source[2]).trim() : null,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Host + title-similarity utilities.
// ---------------------------------------------------------------------------

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** True when two hostnames refer to the same publisher (suffix-tolerant). */
export function sameHost(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = a.replace(/^www\./, "").toLowerCase();
  const y = b.replace(/^www\./, "").toLowerCase();
  return x === y || x.endsWith("." + y) || y.endsWith("." + x);
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "with", "after",
  "over", "at", "is", "are", "as", "by", "from", "its", "his", "her", "how",
  "why", "what", "new", "says", "said", "not", "but", "amid", "into", "out",
  "up", "down", "that", "this", "will", "has", "have", "was", "were",
]);

export function sigWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

/** Rough "is this the same story" proxy: shared significant words. */
export function looksLikeSameStory(query: Set<string>, candidate: string): boolean {
  const cand = sigWords(candidate);
  let shared = 0;
  for (const w of query) if (cand.has(w)) shared += 1;
  const needed = query.size < 4 ? 2 : 3;
  return shared >= needed;
}

export function medianAgeDays(dates: Array<string | null>, now: number): number | null {
  const ages = dates
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter((t) => Number.isFinite(t))
    .map((t) => (now - t) / 86_400_000)
    .sort((a, b) => a - b);
  if (ages.length === 0) return null;
  const mid = Math.floor(ages.length / 2);
  return ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
