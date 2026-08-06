// P0 BASELINE — replay the CURRENT production extraction pipeline over the
// corpus so every other probe has an honest apples-to-apples reference. This
// is exactly what worker/routes/extract.ts attemptExtraction() does: fetch the
// publisher URL with the Chrome UA, pre-strip + Readability, gate on text
// length. Wayback fallback is measured separately by P3.
//
//   npx tsx research/probes/00-baseline/run.ts

import { extractArticle } from "../../../worker/lib/extract/extract.ts";
import { MIN_TEXT_LENGTH } from "../../../worker/lib/extract/detect.ts";
import { loadGold, loadPublishers } from "../../lib/corpus.ts";
import { politeFetch } from "../../lib/fetcher.ts";
import { emit } from "../../lib/metrics.ts";
import { scoreExtraction } from "../../lib/score.ts";

const PROBE_ID = "P0-baseline";
const RESULTS = new URL("../../results/00-baseline.jsonl", import.meta.url)
  .pathname;
const MAX_BODY_BYTES = 1_500_000; // matches production

async function main(): Promise<void> {
  const items = loadPublishers();
  const gold = loadGold();
  console.error(`Baseline over ${items.length} publisher URLs`);

  for (const item of items) {
    const ts = new Date().toISOString();
    const url = item.canonicalUrl!;
    try {
      const res = await politeFetch(url, {
        ua: "chrome",
        maxBytes: MAX_BODY_BYTES,
        timeoutMs: 12_000,
      });
      // Production rejects blocked statuses before parsing.
      if (!res.ok) {
        emit(RESULTS, {
          ...scoreExtraction({
            probeId: PROBE_ID,
            item,
            article: null,
            httpStatus: res.status,
            bytes: res.bytes,
            latencyMs: res.latencyMs,
            subrequests: 1,
            notes: "blocked/non-ok before parse",
            ts,
          }),
        });
        console.error(`  ${item.class} ${item.host} -> http ${res.status}`);
        continue;
      }
      const t0 = performance.now();
      const article = extractArticle(res.body, res.finalUrl);
      const cpuMsParse = performance.now() - t0;
      // Production also gates on MIN_TEXT_LENGTH.
      const usable =
        article && article.textLength >= MIN_TEXT_LENGTH ? article : null;
      const row = scoreExtraction({
        probeId: PROBE_ID,
        item,
        route: "publisher-fetch",
        article: usable,
        gold: gold.get(item.id),
        httpStatus: res.status,
        bytes: res.bytes,
        latencyMs: res.latencyMs,
        cpuMsParse,
        subrequests: 1,
        notes: article && !usable ? "below MIN_TEXT_LENGTH" : undefined,
        ts,
      });
      emit(RESULTS, row);
      console.error(
        `  ${item.class} ${item.publisherHost} -> ${row.ok ? "OK" : "fail"} ${row.wordCount ?? 0}w ${cpuMsParse.toFixed(1)}ms`,
      );
    } catch (e) {
      emit(RESULTS, {
        ...scoreExtraction({
          probeId: PROBE_ID,
          item,
          article: null,
          error: (e as Error).message,
          ts,
        }),
      });
      console.error(`  ${item.class} ${item.publisherHost} -> ERR ${(e as Error).message}`);
    }
  }
  console.error(`\nWrote results to ${RESULTS}`);
}

main();
