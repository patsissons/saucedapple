// Shared metric types + JSONL sink for every probe. One ProbeResult row is
// emitted per (probe x corpus item) so the scorecard in report.ts can be
// regenerated from results/ instead of hand-typed into the findings doc.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Article difficulty classes — see research/README.md for the taxonomy. */
export type CorpusClass = "A" | "B" | "C" | "D";

export interface ProbeResult {
  /** Probe id, e.g. "P2-structured-data". */
  probeId: string;
  /** Corpus item id (the apple.news article id). */
  corpusId: string;
  /** Difficulty class of the corpus item. */
  class: CorpusClass;
  /** The specific route/strategy within the probe that produced this row. */
  route?: string;
  /** Did this probe produce a usable full transcript for this item? */
  ok: boolean;
  httpStatus?: number;
  bytes?: number;
  /** Readability textContent length (chars). */
  textLength?: number;
  /** Word count of extracted text. */
  wordCount?: number;
  /** Did the extracted title match the known article title? */
  titleMatches?: boolean;
  /** wordCount / gold word count, when a gold value exists (0..1+). */
  coverageVsGold?: number;
  /** Did extraction reach the article's final paragraph (anti-truncation)? */
  tailMatched?: boolean;
  /** Wall-clock latency including network wait (ms). */
  latencyMs?: number;
  /** Pure-CPU parse time only — the Worker's 10ms budget is CPU-only (ms). */
  cpuMsParse?: number;
  /** Number of upstream HTTP requests this route made for this item. */
  subrequests?: number;
  error?: string;
  notes?: string;
  /** ISO timestamp; pass in from the caller (Date.now is fine in Node). */
  ts: string;
}

/** Append one result row as JSONL, creating the parent dir if needed. */
export function emit(resultsPath: string, row: ProbeResult): void {
  mkdirSync(dirname(resultsPath), { recursive: true });
  appendFileSync(resultsPath, JSON.stringify(row) + "\n");
}

/** Count words the same way everywhere (whitespace-delimited, trimmed). */
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Loose title match: case/space/punctuation-insensitive containment. */
export function titleMatches(
  extracted: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!extracted || !expected) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const a = norm(extracted);
  const b = norm(expected);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
