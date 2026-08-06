// Turn an extracted article into a scored ProbeResult row. Centralizes the
// definition of "success" so every probe scores identically:
//   ok = titleMatches && wordCount >= 0.80 * reference
// where reference is the gold word count when known, else the best word count
// seen for that article across all probes (filled in later by the caller).

import type { ExtractedArticle } from "../../worker/lib/extract/extract.ts";
import type { CorpusItem, GoldItem } from "./corpus.ts";
import {
  type ProbeResult,
  titleMatches as titlesMatch,
  wordCount as countWords,
} from "./metrics.ts";

export const COVERAGE_THRESHOLD = 0.8;

/** Strip tags to plain text for word counting / fingerprinting. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprintMatch(text: string, fingerprint: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(text).includes(norm(fingerprint));
}

export interface ScoreInput {
  probeId: string;
  item: CorpusItem;
  route?: string;
  article: ExtractedArticle | null;
  gold?: GoldItem;
  httpStatus?: number;
  bytes?: number;
  latencyMs?: number;
  cpuMsParse?: number;
  subrequests?: number;
  error?: string;
  notes?: string;
  ts: string;
}

export function scoreExtraction(input: ScoreInput): ProbeResult {
  const { article, item, gold } = input;
  const base: ProbeResult = {
    probeId: input.probeId,
    corpusId: item.id,
    class: item.class,
    route: input.route,
    ok: false,
    httpStatus: input.httpStatus,
    bytes: input.bytes,
    latencyMs: input.latencyMs,
    cpuMsParse: input.cpuMsParse,
    subrequests: input.subrequests,
    error: input.error,
    notes: input.notes,
    ts: input.ts,
  };

  if (!article) return base;

  const text = htmlToText(article.html);
  const words = countWords(text);
  const matched = titlesMatch(article.title ?? item.title, item.title);
  const coverage = gold ? words / gold.goldWordCount : undefined;
  const tail = gold ? fingerprintMatch(text, gold.tailFingerprint) : undefined;

  // Title is a gate only when we know the expected title (apple.news items).
  // RSS-sourced publisher items carry no title, so word count is the signal.
  const titleGate = item.title ? matched : true;

  // With gold: full-transcript success. Without gold: provisional (parsed to a
  // reasonable length); the report step re-derives best-known coverage across
  // probes for non-gold items.
  const ok = gold
    ? titleGate && coverage !== undefined && coverage >= COVERAGE_THRESHOLD
    : titleGate && words >= 250;

  return {
    ...base,
    ok,
    textLength: article.textLength,
    wordCount: words,
    titleMatches: matched,
    coverageVsGold: coverage,
    tailMatched: tail,
  };
}
