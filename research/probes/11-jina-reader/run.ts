// P11 r.jina.ai — free reader proxy that fetches + renders (incl. JS) + extracts
// an article to clean markdown, no API key. P4 proved it is browser-fetchable
// (CORS-open), so it can run client-side: zero Worker CPU and zero Worker
// subrequests. NOTE: the browser still cannot fetch publishers itself (CORS),
// so jina does the fetching from ITS OWN infrastructure (Google Cloud, per its
// response headers) — there is NO "user's residential IP" advantage, contrary
// to this probe's original claim.
//
//   npx tsx research/probes/11-jina-reader/run.ts
//
// ToS note: r.jina.ai is a third-party service (free tier ~20 rpm, no key). It
// is a shared dependency and its free terms can change — flagged in FINDINGS.

import { analyzeProse, isUsableTranscript } from "../../lib/article-text.ts";
import { loadPublishers } from "../../lib/corpus.ts";
import { politeFetch } from "../../lib/fetcher.ts";
import { emit, type ProbeResult } from "../../lib/metrics.ts";

const PROBE_ID = "P11-jina";
const RESULTS = new URL("../../results/11-jina-reader.jsonl", import.meta.url)
  .pathname;

// CORRECTED METRIC. The first pass scored success on jina's RAW word count,
// which counts navigation, subscription offers, related-article teasers and
// footers as article text — so paywalled pages scored as 900-word "wins" while
// containing zero article prose (FT returns "Then $75 per month… © THE
// FINANCIAL TIMES LTD"). Success now requires genuine article prose; see
// research/lib/article-text.ts.

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
      // Strip jina's metadata preamble, then measure ARTICLE prose only.
      const body = res.body.split("Markdown Content:")[1] ?? res.body;
      const prose = analyzeProse(body);
      const ok = res.ok && isUsableTranscript(prose);
      row = {
        probeId: PROBE_ID,
        corpusId: item.id,
        class: item.class,
        route: "jina-markdown",
        ok,
        httpStatus: res.status,
        bytes: res.bytes,
        wordCount: prose.articleWords,
        latencyMs: res.latencyMs,
        subrequests: 1,
        notes: `raw=${prose.rawWords}w article=${prose.articleWords}w paras=${prose.articleParagraphs} chrome=${prose.chromeParagraphs}`,
        ts,
      };
      console.error(
        `  ${item.class} ${String(item.publisherHost).padEnd(22)} -> ${ok ? "OK  " : "fail"} article=${String(prose.articleWords).padStart(4)}w (raw=${String(prose.rawWords).padStart(4)}w) ${res.fromCache ? "cache" : res.latencyMs + "ms"}`,
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
