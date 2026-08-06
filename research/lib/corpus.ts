// Corpus loading + the "gold" reference set. The corpus is a frozen JSONL of
// real apple.news links spanning four difficulty classes; gold.jsonl holds a
// hand-verified subset with true word counts so "did we get the FULL
// transcript" is answerable, not guessed.

import { existsSync, readFileSync } from "node:fs";
import type { CorpusClass } from "./metrics.ts";

export interface CorpusItem {
  /** apple.news article id (the At...) — also the corpusId in results. */
  id: string;
  appleNewsUrl: string;
  /** Publisher hostname, once known (may be null for News+ exclusives). */
  publisherHost: string | null;
  class: CorpusClass;
  /** Publisher canonical URL, once resolved (null = News+ exclusive). */
  canonicalUrl: string | null;
  title: string | null;
  /** ISO publish date if known — Wayback/paywall behavior varies with age. */
  publishedAt: string | null;
  harvestedAt: string;
  /** Where this link came from (hn-algolia, reddit, manual). */
  source: string;
  notes?: string;
}

export interface GoldItem {
  id: string;
  /** True word count of the full article body, read manually once. */
  goldWordCount: number;
  /** First ~8 words of the body — a fingerprint for the article start. */
  headFingerprint: string;
  /** Last ~8 words of the body — catches silent truncation. */
  tailFingerprint: string;
}

const CORPUS_PATH = new URL("../corpus/links.jsonl", import.meta.url).pathname;
const GOLD_PATH = new URL("../corpus/gold.jsonl", import.meta.url).pathname;

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

export function loadCorpus(filter?: {
  classes?: CorpusClass[];
  ids?: string[];
}): CorpusItem[] {
  let items = readJsonl<CorpusItem>(CORPUS_PATH);
  if (filter?.classes) {
    const set = new Set(filter.classes);
    items = items.filter((i) => set.has(i.class));
  }
  if (filter?.ids) {
    const set = new Set(filter.ids);
    items = items.filter((i) => set.has(i.id));
  }
  return items;
}

export function loadGold(): Map<string, GoldItem> {
  return new Map(readJsonl<GoldItem>(GOLD_PATH).map((g) => [g.id, g]));
}

const PUBLISHERS_PATH = new URL("../corpus/publishers.jsonl", import.meta.url)
  .pathname;

interface RawPublisher {
  id: string;
  url: string;
  host: string;
  class: CorpusClass;
  harvestedAt: string;
}

/**
 * Real current publisher article URLs (from RSS), shaped as CorpusItem so the
 * same scoring path applies. These have no apple.news link and no known title;
 * they drive the extraction probes (P2/P3/P5/P9-P11).
 */
export function loadPublishers(filter?: {
  classes?: CorpusClass[];
}): CorpusItem[] {
  let raw = readJsonl<RawPublisher>(PUBLISHERS_PATH);
  if (filter?.classes) {
    const set = new Set(filter.classes);
    raw = raw.filter((r) => set.has(r.class));
  }
  return raw.map((r) => ({
    id: r.id,
    appleNewsUrl: "",
    publisherHost: r.host,
    class: r.class,
    canonicalUrl: r.url,
    title: null,
    publishedAt: null,
    harvestedAt: r.harvestedAt,
    source: "rss",
  }));
}
