// P11 r.jina.ai — free reader proxy that fetches + renders (incl. JS) + extracts
// an article to clean markdown, no API key. P4 proved it is ALSO browser-
// fetchable (CORS-open), so it has a client-side deployment path: the user's
// browser calls r.jina.ai/<url> directly — zero Worker CPU, residential IP
// (beats Cloudflare-IP publisher blocks). This probe measures its hit rate and
// latency over the corpus, with attention to class C (WSJ/FT) where the
// baseline scores 0%.
//
//   npx tsx research/probes/11-jina-reader/run.ts
//
// ToS note: r.jina.ai is a third-party service (free tier ~20 rpm, no key). It
// is a shared dependency and its free terms can change — flagged in FINDINGS.

import { loadPublishers } from "../../lib/corpus.ts";
import { politeFetch } from "../../lib/fetcher.ts";
import { emit, type ProbeResult, wordCount } from "../../lib/metrics.ts";

const PROBE_ID = "P11-jina";
const RESULTS = new URL("../../results/11-jina-reader.jsonl", import.meta.url)
  .pathname;

// jina returns markdown; a real article is a few hundred+ words. Below this is
// an error page / paywall stub / bot wall.
const MIN_WORDS = 250;

// Signals that jina returned a block/error rather than an article.
const ERROR_MARKERS =
  /(you (have|'ve) been blocked|enable javascript|are you a robot|access denied|subscribe to (read|continue)|402 payment required|rate limit)/i;

async function main(): Promise<void> {
  // Prioritize the hard classes — that's where jina must earn its place.
  const items = [
    ...loadPublishers({ classes: ["C"] }),
    ...loadPublishers({ classes: ["B"] }),
    ...loadPublishers({ classes: ["A"] }),
  ];
  console.error(`P11 r.jina.ai over ${items.length} publisher URLs`);

  for (const item of items) {
    const ts = new Date().toISOString();
    const target = item.canonicalUrl!;
    const jinaUrl = `https://r.jina.ai/${target}`;
    let row: ProbeResult;
    try {
      const res = await politeFetch(jinaUrl, {
        ua: "polite",
        headers: { accept: "text/plain", "x-respond-with": "markdown" },
        timeoutMs: 30_000, // jina renders JS; it can be slow
        maxBytes: 2_000_000,
      });
      const words = wordCount(res.body);
      const looksBlocked = ERROR_MARKERS.test(res.body.slice(0, 4000));
      const ok = res.ok && words >= MIN_WORDS && !looksBlocked;
      row = {
        probeId: PROBE_ID,
        corpusId: item.id,
        class: item.class,
        route: "jina-markdown",
        ok,
        httpStatus: res.status,
        bytes: res.bytes,
        wordCount: words,
        latencyMs: res.latencyMs,
        subrequests: 1,
        notes: looksBlocked ? "jina returned a block/stub" : undefined,
        ts,
      };
      console.error(
        `  ${item.class} ${item.publisherHost} -> ${ok ? "OK" : "fail"} ${words}w ${res.status} ${res.fromCache ? "(cache)" : res.latencyMs + "ms"}`,
      );
    } catch (e) {
      row = {
        probeId: PROBE_ID,
        corpusId: item.id,
        class: item.class,
        route: "jina-markdown",
        ok: false,
        error: (e as Error).message,
        ts,
      };
      console.error(`  ${item.class} ${item.publisherHost} -> ERR ${(e as Error).message}`);
    }
    emit(RESULTS, row);
  }
  console.error(`\nWrote results to ${RESULTS}`);
}

main();
