// P6 SAME-STORY DISCOVERY — "N other outlets are covering this story, here are
// the open ones". The current app already links a Google News search; this
// measures how much structured value we can extract for free. KEY MECHANIC:
// Google News RSS names each result's publisher in a <source url="…"> element,
// so we get the outlet host WITHOUT decoding Google's opaque redirect links
// (the trap the first pass fell into).
//
//   npx tsx research/probes/06-same-story/run.ts
//
// Honest caveats measured here: Google News RSS median item age is ~6.6 days
// (bad for breaking news), and title-search returns tangential matches — so we
// filter results to those whose headline shares significant tokens with the
// query, and report both raw and same-story-filtered outlet counts.

import { CLASS_A } from "../../corpus/publisher-classes.ts";
import { loadPublishers } from "../../lib/corpus.ts";
import { politeFetch } from "../../lib/fetcher.ts";
import { emit, type ProbeResult } from "../../lib/metrics.ts";

const PROBE_ID = "P6-same-story";
const RESULTS = new URL("../../results/06-same-story.jsonl", import.meta.url)
  .pathname;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "how", "why",
  "what", "who", "will", "its", "it", "this", "that", "these", "those", "you",
]);

function significantTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / new Set([...a, ...b]).size;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isOpen(host: string): boolean {
  return CLASS_A.some((h) => host === h || host.endsWith("." + h));
}

async function titleOf(url: string): Promise<string | null> {
  const res = await politeFetch(url, { ua: "chrome", timeoutMs: 12_000 });
  if (!res.ok) return null;
  const og = res.body.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og) return og[1];
  const t = res.body.match(/<title>([^<]+)<\/title>/i);
  return t ? t[1] : null;
}

interface Discovery {
  distinctOutlets: number;
  sameStoryOutlets: number;
  openOutlets: number;
  examples: string[];
  items: number;
}

async function discover(title: string, originalHost: string): Promise<Discovery> {
  const q = encodeURIComponent(title);
  const res = await politeFetch(
    `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`,
    { ua: "chrome", timeoutMs: 12_000 },
  );
  const queryTokens = significantTokens(title);
  const allOutlets = new Set<string>();
  const sameStoryOutlets = new Set<string>();
  const openOutlets = new Set<string>();
  const examples: string[] = [];
  let items = 0;

  for (const chunk of res.body.split("<item>").slice(1)) {
    items++;
    const itemTitle = chunk.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    const srcUrl = chunk.match(/<source url="([^"]+)"/)?.[1] ?? "";
    const host = hostOf(srcUrl);
    if (!host || host === originalHost) continue;
    allOutlets.add(host);
    // Same-story filter: headline shares significant tokens with the query.
    if (jaccard(queryTokens, significantTokens(itemTitle)) >= 0.15) {
      sameStoryOutlets.add(host);
      if (isOpen(host)) openOutlets.add(host);
      if (examples.length < 4) examples.push(host);
    }
  }
  return {
    distinctOutlets: allOutlets.size,
    sameStoryOutlets: sameStoryOutlets.size,
    openOutlets: openOutlets.size,
    examples,
    items,
  };
}

async function main(): Promise<void> {
  const items = loadPublishers();
  console.error(`P6 same-story discovery over ${items.length} articles`);

  for (const item of items) {
    const ts = new Date().toISOString();
    const url = item.canonicalUrl!;
    let row: ProbeResult;
    try {
      const title = await titleOf(url);
      if (!title) {
        row = {
          probeId: PROBE_ID, corpusId: item.id, class: item.class,
          route: "google-news-rss", ok: false, subrequests: 1,
          notes: "no title", ts,
        };
      } else {
        const r = await discover(title, item.publisherHost ?? "");
        // Value = at least 3 OTHER outlets on the same story.
        const ok = r.sameStoryOutlets >= 3;
        row = {
          probeId: PROBE_ID, corpusId: item.id, class: item.class,
          route: "google-news-rss", ok, subrequests: 2,
          notes: `sameStory=${r.sameStoryOutlets} open=${r.openOutlets} raw=${r.distinctOutlets}/${r.items} [${r.examples.join(",")}]`,
          ts,
        };
        console.error(`  ${item.class} ${item.publisherHost} -> ${ok ? "OK" : "thin"} ${row.notes}`);
      }
    } catch (e) {
      row = {
        probeId: PROBE_ID, corpusId: item.id, class: item.class,
        route: "google-news-rss", ok: false, error: (e as Error).message, ts,
      };
    }
    emit(RESULTS, row);
  }
  console.error(`\nWrote results to ${RESULTS}`);
}

main();
