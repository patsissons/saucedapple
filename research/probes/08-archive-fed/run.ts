// P8 ARCHIVE FEDERATION — the Memento TimeTravel aggregator was sunset (Aug
// 2025), so query individual web archives' CDX/TimeMap endpoints directly to
// find snapshots the Wayback Machine may not have. Arquivo.pt (the Portuguese
// national web archive) is large, open, keyless, and — per P4 — its snapshot
// content is browser-fetchable (ACAO *), so a hit here is genuinely usable
// client-side, unlike Wayback snapshots.
//
//   npx tsx research/probes/08-archive-fed/run.ts

import { loadPublishers } from "../../lib/corpus.ts";
import { politeFetch, type UAName } from "../../lib/fetcher.ts";
import { emit, type ProbeResult } from "../../lib/metrics.ts";

const PROBE_ID = "P8-archive-fed";
const RESULTS = new URL("../../results/08-archive-fed.jsonl", import.meta.url)
  .pathname;

interface Archive {
  name: string;
  ua: UAName;
  cdx: (url: string) => string;
  /** Count snapshot rows in the CDX/TimeMap response. */
  countSnapshots: (body: string) => number;
}

const ARCHIVES: Archive[] = [
  {
    name: "arquivo.pt",
    ua: "polite",
    cdx: (url) =>
      `https://arquivo.pt/wayback/cdx?url=${encodeURIComponent(url)}&output=json&limit=5`,
    // Arquivo CDX returns newline-delimited JSON arrays (or a JSON array).
    countSnapshots: (body) =>
      body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("[") || l.startsWith("{")).length,
  },
  {
    name: "ukwa",
    ua: "polite",
    // UK Web Archive Memento TimeMap (link-format).
    cdx: (url) => `https://www.webarchive.org.uk/wayback/archive/timemap/link/${url}`,
    countSnapshots: (body) => (body.match(/rel="memento"/g) ?? []).length,
  },
];

async function main(): Promise<void> {
  // Paywalled classes are where an extra archive matters most.
  const items = [
    ...loadPublishers({ classes: ["C"] }),
    ...loadPublishers({ classes: ["B"] }),
  ];
  console.error(`P8 archive federation over ${items.length} paywalled URLs`);

  for (const item of items) {
    const url = item.canonicalUrl!;
    let anyHit = false;
    for (const archive of ARCHIVES) {
      const ts = new Date().toISOString();
      let row: ProbeResult;
      try {
        const res = await politeFetch(archive.cdx(url), {
          ua: archive.ua,
          timeoutMs: 12_000,
        });
        const snapshots = res.ok ? archive.countSnapshots(res.body) : 0;
        const ok = snapshots > 0;
        if (ok) anyHit = true;
        row = {
          probeId: PROBE_ID,
          corpusId: item.id,
          class: item.class,
          route: archive.name,
          ok,
          httpStatus: res.status,
          bytes: res.bytes,
          subrequests: 1,
          notes: `${snapshots} snapshots`,
          ts,
        };
      } catch (e) {
        row = {
          probeId: PROBE_ID,
          corpusId: item.id,
          class: item.class,
          route: archive.name,
          ok: false,
          error: (e as Error).message,
          ts,
        };
      }
      emit(RESULTS, row);
    }
    console.error(`  ${item.class} ${item.publisherHost} -> ${anyHit ? "snapshot found" : "no non-Wayback snapshot"}`);
  }
  console.error(`\nWrote results to ${RESULTS}`);
}

main();
