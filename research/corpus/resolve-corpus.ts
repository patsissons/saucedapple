// Resolve harvested apple.news links to their publisher canonical URL, drop
// dead (404/link-rot) ones, auto-classify by publisher host, and freeze the
// survivors into links.jsonl. Class D (News+ exclusive) is detectable here:
// a live apple.news page that parses but yields canonicalUrl === null.
//
//   npx tsx research/corpus/resolve-corpus.ts            # dry run, print
//   npx tsx research/corpus/resolve-corpus.ts --write    # write links.jsonl

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseAppleNewsPage } from "../../worker/lib/apple-news.ts";
import type { CorpusItem } from "../lib/corpus.ts";
import { politeFetch } from "../lib/fetcher.ts";
import { classifyPublisher } from "./publisher-classes.ts";

const RAW = new URL("./links.raw.jsonl", import.meta.url).pathname;
const OUT = new URL("./links.jsonl", import.meta.url).pathname;

interface Raw {
  id: string;
  appleNewsUrl: string;
  source: string;
  title: string | null;
  harvestedAt: string;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!existsSync(RAW)) {
    console.error(`No ${RAW}. Run: npx tsx research/corpus/build-corpus.ts --write`);
    return;
  }
  const raws = readFileSync(RAW, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Raw);
  const seen = new Set<string>();
  const items: CorpusItem[] = [];

  for (const raw of raws) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    let status = 0;
    let canonicalUrl: string | null = null;
    let title: string | null = raw.title;
    try {
      const res = await politeFetch(raw.appleNewsUrl, {
        ua: "iphone",
        timeoutMs: 10_000,
      });
      status = res.status;
      if (res.ok) {
        const page = parseAppleNewsPage(res.body);
        canonicalUrl = page?.canonicalUrl ?? null;
        title = page?.title ?? raw.title;
      }
    } catch (e) {
      console.error(`${raw.id}: ${(e as Error).message}`);
    }

    if (status === 404) {
      console.error(`drop ${raw.id} (link rot, 404)`);
      continue;
    }
    const host = hostOf(canonicalUrl);
    // Live page, parses, but no canonical -> News+ exclusive (class D).
    const cls = canonicalUrl === null && status === 200 ? "D" : classifyPublisher(host);
    items.push({
      id: raw.id,
      appleNewsUrl: raw.appleNewsUrl,
      publisherHost: host,
      class: cls,
      canonicalUrl,
      title,
      publishedAt: null,
      harvestedAt: raw.harvestedAt,
      source: raw.source,
      notes: status === 200 ? undefined : `resolve http ${status}`,
    });
    console.error(`keep ${raw.id} [${cls}] ${host ?? "(no canonical)"}`);
  }

  console.error(`\nResolved ${items.length} live links.`);
  const byClass = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.class] = (acc[i.class] ?? 0) + 1;
    return acc;
  }, {});
  console.error("By class:", JSON.stringify(byClass));

  if (process.argv.includes("--write")) {
    writeFileSync(OUT, items.map((i) => JSON.stringify(i)).join("\n") + "\n");
    console.error(`Wrote ${items.length} items to corpus/links.jsonl`);
  } else {
    for (const i of items) console.log(JSON.stringify(i));
  }
}

main();
