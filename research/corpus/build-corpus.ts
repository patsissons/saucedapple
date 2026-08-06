// Harvest real apple.news links to seed the corpus. Sources that are free and
// return JSON: HN Algolia (full-text search) and Reddit (public search JSON).
// Both are also standalone probes later (P7), so this doubles as an early
// liveness check on them.
//
//   npx tsx research/corpus/build-corpus.ts            # print harvested links
//   npx tsx research/corpus/build-corpus.ts --write    # append to links.jsonl
//
// Class labels (A/B/C/D) are assigned later by resolve-corpus.ts, which
// resolves each link to its publisher and buckets by known paywall behavior.
// Classes C (hard paywall) and D (News+ exclusive) rarely circulate publicly
// and are topped up by hand — see research/README.md.

import { appendFileSync } from "node:fs";
import { politeFetch, UA } from "../lib/fetcher.ts";

interface Harvested {
  id: string;
  appleNewsUrl: string;
  source: string;
  title: string | null;
  harvestedAt: string;
}

const APPLE_NEWS_RE = /https?:\/\/apple\.news\/([A-Za-z0-9_-]{10,60})/g;

function extractLinks(text: string): Array<{ id: string; url: string }> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(APPLE_NEWS_RE)) {
    out.set(m[1], `https://apple.news/${m[1]}`);
  }
  return [...out.entries()].map(([id, url]) => ({ id, url }));
}

async function harvestHnAlgolia(now: string): Promise<Harvested[]> {
  const out: Harvested[] = [];
  // Query several ways: relevance + recency, stories + comments. apple.news
  // links are pasted most often in comments, so tags=comment is the richest.
  const endpoints = [
    "search?query=apple.news&hitsPerPage=200",
    "search_by_date?query=apple.news&hitsPerPage=200",
    "search_by_date?query=apple.news&tags=comment&hitsPerPage=500",
    "search?query=apple.news&tags=comment&hitsPerPage=500",
  ];
  for (const ep of endpoints) {
    const res = await politeFetch(`https://hn.algolia.com/api/v1/${ep}`, {
      ua: "polite",
    });
    if (!res.ok) {
      console.error(`HN Algolia ${ep} -> ${res.status}`);
      continue;
    }
    const data = JSON.parse(res.body) as {
      hits: Array<{
        url?: string;
        title?: string;
        story_title?: string;
        story_text?: string;
        comment_text?: string;
        created_at?: string;
      }>;
    };
    for (const hit of data.hits) {
      const blob = [
        hit.url,
        hit.title,
        hit.story_text,
        hit.comment_text,
      ]
        .filter(Boolean)
        .join(" ");
      for (const { id, url: link } of extractLinks(blob)) {
        out.push({
          id,
          appleNewsUrl: link,
          source: "hn-algolia",
          title: hit.title ?? hit.story_title ?? null,
          harvestedAt: now,
        });
      }
    }
  }
  return out;
}

async function harvestReddit(now: string): Promise<Harvested[]> {
  const out: Harvested[] = [];
  // Reddit's public search JSON. url:apple.news finds link submissions.
  const url =
    "https://old.reddit.com/search.json?q=url%3Aapple.news&sort=new&limit=100";
  const res = await politeFetch(url, {
    ua: "chrome",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    console.error(`Reddit ${res.status} (datacenter IPs are commonly blocked)`);
    return out;
  }
  try {
    const data = JSON.parse(res.body) as {
      data?: { children?: Array<{ data?: { url?: string; title?: string } }> };
    };
    for (const child of data.data?.children ?? []) {
      const link = child.data?.url ?? "";
      for (const { id, url: found } of extractLinks(link)) {
        out.push({
          id,
          appleNewsUrl: found,
          source: "reddit",
          title: child.data?.title ?? null,
          harvestedAt: now,
        });
      }
    }
  } catch (e) {
    console.error("Reddit parse failed:", (e as Error).message);
  }
  return out;
}

async function main(): Promise<void> {
  const now = new Date().toISOString();
  console.error(`UA: ${UA.polite}`);
  const [hn, reddit] = await Promise.all([
    harvestHnAlgolia(now).catch((e) => {
      console.error("HN failed:", e.message);
      return [] as Harvested[];
    }),
    harvestReddit(now).catch((e) => {
      console.error("Reddit failed:", e.message);
      return [] as Harvested[];
    }),
  ]);

  const dedup = new Map<string, Harvested>();
  for (const h of [...hn, ...reddit]) if (!dedup.has(h.id)) dedup.set(h.id, h);
  const links = [...dedup.values()];

  console.error(
    `Harvested ${links.length} unique apple.news links (HN ${hn.length}, Reddit ${reddit.length})`,
  );

  if (process.argv.includes("--write")) {
    const path = new URL("./links.raw.jsonl", import.meta.url).pathname;
    for (const l of links) appendFileSync(path, JSON.stringify(l) + "\n");
    console.error(`Wrote ${links.length} raw links to corpus/links.raw.jsonl`);
    console.error("Next: run resolve-corpus.ts to classify + freeze links.jsonl");
  } else {
    for (const l of links) console.log(JSON.stringify(l));
  }
}

main();
