// Build a corpus of REAL, CURRENT publisher article URLs across difficulty
// classes by pulling each outlet's public RSS/Atom feed. RSS lists article
// URLs even for hard-paywall outlets (the URL is public; the body is not) —
// so this is our route to genuine class-C coverage without scarce apple.news
// links. Every extraction probe (P2/P3/P5/P9-P11) runs against this set.
//
//   npx tsx research/corpus/build-publishers.ts            # dry run
//   npx tsx research/corpus/build-publishers.ts --write    # write publishers.jsonl

import { writeFileSync } from "node:fs";
import type { CorpusClass } from "../lib/metrics.ts";
import { politeFetch } from "../lib/fetcher.ts";
import { classifyPublisher } from "./publisher-classes.ts";

interface Feed {
  host: string;
  class: CorpusClass;
  rss: string;
}

// A handful per class. Feeds chosen for stability; article URLs are current.
const FEEDS: Feed[] = [
  // A — open
  { host: "apnews.com", class: "A", rss: "https://apnews.com/hub/ap-top-news/rss" },
  { host: "npr.org", class: "A", rss: "https://feeds.npr.org/1001/rss.xml" },
  { host: "arstechnica.com", class: "A", rss: "https://feeds.arstechnica.com/arstechnica/index" },
  { host: "theguardian.com", class: "A", rss: "https://www.theguardian.com/world/rss" },
  { host: "bbc.co.uk", class: "A", rss: "https://feeds.bbci.co.uk/news/rss.xml" },
  { host: "propublica.org", class: "A", rss: "https://www.propublica.org/feeds/propublica/main" },
  // B — soft / metered
  { host: "nytimes.com", class: "B", rss: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { host: "washingtonpost.com", class: "B", rss: "https://feeds.washingtonpost.com/rss/world" },
  { host: "theatlantic.com", class: "B", rss: "https://www.theatlantic.com/feed/all/" },
  { host: "wired.com", class: "B", rss: "https://www.wired.com/feed/rss" },
  { host: "latimes.com", class: "B", rss: "https://www.latimes.com/world-nation/rss2.0.xml" },
  { host: "newyorker.com", class: "B", rss: "https://www.newyorker.com/feed/everything" },
  // C — hard / bot-hardened (URLs public, bodies paywalled)
  { host: "wsj.com", class: "C", rss: "https://feeds.a.dj.com/rss/RSSWorldNews.xml" },
  { host: "ft.com", class: "C", rss: "https://www.ft.com/rss/home" },
  { host: "economist.com", class: "C", rss: "https://www.economist.com/finance-and-economics/rss.xml" },
  { host: "businessinsider.com", class: "C", rss: "https://www.businessinsider.com/rss" },
  { host: "barrons.com", class: "C", rss: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
];

const LINK_RE = /<link[^>]*>([^<]+)<\/link>|<link[^>]+href=["']([^"']+)["']/gi;
const GUID_RE = /<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/gi;

function extractItemUrls(xml: string, host: string): string[] {
  const urls = new Set<string>();
  for (const m of xml.matchAll(LINK_RE)) {
    const url = (m[1] ?? m[2] ?? "").trim();
    if (url.startsWith("http") && url.includes(host.replace(/^www\./, ""))) {
      urls.add(url.replace(/[?#].*$/, ""));
    }
  }
  for (const m of xml.matchAll(GUID_RE)) {
    const url = m[1].trim();
    if (url.includes(host.replace(/^www\./, ""))) urls.add(url.replace(/[?#].*$/, ""));
  }
  return [...urls];
}

interface PublisherItem {
  id: string;
  url: string;
  host: string;
  class: CorpusClass;
  harvestedAt: string;
}

async function main(): Promise<void> {
  const now = new Date().toISOString();
  const perFeed = 3;
  const items: PublisherItem[] = [];
  const seen = new Set<string>();

  for (const feed of FEEDS) {
    try {
      const res = await politeFetch(feed.rss, { ua: "chrome", timeoutMs: 12_000 });
      if (!res.ok) {
        console.error(`${feed.host}: RSS http ${res.status}`);
        continue;
      }
      const urls = extractItemUrls(res.body, feed.host).slice(0, perFeed);
      if (urls.length === 0) console.error(`${feed.host}: no item URLs parsed`);
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        const host = new URL(url).hostname.replace(/^www\./, "");
        items.push({
          id: `pub-${host}-${items.length}`,
          url,
          host,
          class: feed.class === classifyPublisher(host) ? feed.class : feed.class,
          harvestedAt: now,
        });
      }
      console.error(`${feed.host}: +${urls.length}`);
    } catch (e) {
      console.error(`${feed.host}: ${(e as Error).message}`);
    }
  }

  const byClass = items.reduce<Record<string, number>>((a, i) => {
    a[i.class] = (a[i.class] ?? 0) + 1;
    return a;
  }, {});
  console.error(`\nBuilt ${items.length} publisher URLs. By class:`, JSON.stringify(byClass));

  if (process.argv.includes("--write")) {
    const out = new URL("./publishers.jsonl", import.meta.url).pathname;
    writeFileSync(out, items.map((i) => JSON.stringify(i)).join("\n") + "\n");
    console.error(`Wrote ${items.length} to corpus/publishers.jsonl`);
  } else {
    for (const i of items) console.log(JSON.stringify(i));
  }
}

main();
