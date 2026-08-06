// P3 WAYBACK CDX MULTI-SNAPSHOT — does picking snapshots intelligently via the
// CDX API beat production's single availability-API call (worker/lib/wayback.ts
// findWaybackSnapshot)? Hypothesis: for paywalled articles a specific (often
// NON-newest) capture yields full text where "newest snapshot" yields a paywall
// stub.
//
// Two strategies, emitted under distinct probeIds so report.ts compares them:
//   P3-baseline-availability — production control: one availability call, fetch
//     the closest snapshot with the id_ flag, extract, score.
//   P3-cdx-multi — one CDX query, then try up to 3 diverse candidates
//     (earliest / mid / latest, id_ flag) plus one if_-flag variant.
//
// SAFETY: every request goes through politeFetch (>=3s spacing on archive
// hosts + disk cache), ua:"polite", hard RequestBudget ceiling. Aborts on
// repeated 429/503.
//
//   npx tsx research/probes/03-wayback-cdx/run.ts

import { extractArticle } from "../../../worker/lib/extract/extract.ts";
import { MIN_TEXT_LENGTH } from "../../../worker/lib/extract/detect.ts";
import { loadGold, loadPublishers, type CorpusItem } from "../../lib/corpus.ts";
import { politeFetch, type FetchResult } from "../../lib/fetcher.ts";
import { emit } from "../../lib/metrics.ts";
import { scoreExtraction } from "../../lib/score.ts";
import { RequestBudget } from "../../lib/ratelimit.ts";

const RESULTS = new URL("../../results/03-wayback-cdx.jsonl", import.meta.url)
  .pathname;
const MAX_BODY_BYTES = 1_500_000; // matches production
const SNAPSHOT_TIMEOUT_MS = 20_000; // archives are slow
const BUDGET_PER_HOST = 60; // hard per-run ceiling (web.archive.org is the hot host)
const WORST_CASE_PER_ARTICLE = 6; // 1 baseline snap + 1 CDX + 3 id_ + 1 if_
const MAX_RATE_LIMIT_HITS = 3; // stop the whole run after this many 429/503

// Hand-picked ARTICLE urls (no homepages/section fronts) from publishers.jsonl.
// Ordered C (hard paywall) -> A (controls) -> B so the thesis classes are
// covered first if the budget runs dry.
const SELECTED_IDS = [
  // C — hard paywalls
  "pub-wsj.com-34",
  "pub-wsj.com-35",
  "pub-ft.com-37",
  "pub-ft.com-38",
  "pub-economist.com-40",
  "pub-economist.com-41",
  // A — controls
  "pub-npr.org-2",
  "pub-arstechnica.com-4",
  // B — metered paywalls
  "pub-nytimes.com-16",
  "pub-nytimes.com-17",
  "pub-washingtonpost.com-20",
  "pub-theatlantic.com-23",
  "pub-wired.com-25",
  "pub-latimes.com-28",
  "pub-newyorker.com-32",
];

const budget = new RequestBudget(BUDGET_PER_HOST);
const gold = loadGold();
let rateLimitHits = 0;

interface Capture {
  timestamp: string;
  original: string;
  mimetype: string;
}

interface AttemptOutcome {
  route: string;
  ok: boolean;
  textLength: number;
  timestamp: string | null;
  flag: "id_" | "if_";
}

class RateLimitAbort extends Error {}

function noteRateLimit(res: FetchResult): void {
  if (res.fromCache) return;
  if (res.status === 429 || res.status === 503) {
    rateLimitHits += 1;
    console.error(
      `  !! rate-limit signal ${res.status} (hit ${rateLimitHits}/${MAX_RATE_LIMIT_HITS})` +
        (res.headers["x-rl"] ? ` x-rl:${res.headers["x-rl"]}` : ""),
    );
    if (rateLimitHits >= MAX_RATE_LIMIT_HITS) throw new RateLimitAbort();
  }
}

function usedOn(host: string): number {
  return budget.report()[host] ?? 0;
}

/** Actual capture timestamp the archive served (id_ URLs redirect to nearest). */
function servedTimestamp(finalUrl: string): string | null {
  const m = /\/web\/(\d{4,14})/.exec(finalUrl);
  return m ? m[1] : null;
}

/** Fetch one snapshot, extract with the REAL production extractor, emit a row. */
async function attemptSnapshot(
  probeId: string,
  item: CorpusItem,
  route: string,
  snapshotUrl: string,
  requestedTs: string,
  flag: "id_" | "if_",
  extraSubrequests: number,
  extraNotes: string,
): Promise<AttemptOutcome> {
  const ts = new Date().toISOString();
  const fail = (o: Partial<AttemptOutcome>): AttemptOutcome => ({
    route,
    ok: false,
    textLength: 0,
    timestamp: requestedTs,
    flag,
    ...o,
  });
  let res: FetchResult;
  try {
    res = await politeFetch(snapshotUrl, {
      ua: "polite",
      budget,
      maxBytes: MAX_BODY_BYTES,
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
    });
  } catch (e) {
    if (e instanceof RateLimitAbort) throw e;
    emit(RESULTS, {
      ...scoreExtraction({
        probeId,
        item,
        route,
        article: null,
        subrequests: 1 + extraSubrequests,
        error: (e as Error).message,
        notes: `ts=${requestedTs} flag=${flag} ${extraNotes}`.trim(),
        ts,
      }),
    });
    return fail({});
  }
  noteRateLimit(res);
  const served = servedTimestamp(res.finalUrl) ?? requestedTs;
  const baseNotes =
    `ts=${served} requested=${requestedTs} flag=${flag} cache=${res.fromCache ? 1 : 0} ${extraNotes}`.trim();

  if (!res.ok) {
    emit(RESULTS, {
      ...scoreExtraction({
        probeId,
        item,
        route,
        article: null,
        httpStatus: res.status,
        bytes: res.bytes,
        latencyMs: res.latencyMs,
        subrequests: 1 + extraSubrequests,
        notes: baseNotes,
        ts,
      }),
    });
    return fail({ timestamp: served });
  }

  const t0 = performance.now();
  const article = extractArticle(res.body, res.finalUrl);
  const cpuMsParse = performance.now() - t0;
  // Success gate matches production: MIN_TEXT_LENGTH (800) or the attempt fails.
  const usable =
    article && article.textLength >= MIN_TEXT_LENGTH ? article : null;
  const row = scoreExtraction({
    probeId,
    item,
    route,
    article: usable,
    gold: gold.get(item.id),
    httpStatus: res.status,
    bytes: res.bytes,
    latencyMs: res.latencyMs,
    cpuMsParse,
    subrequests: 1 + extraSubrequests,
    notes:
      (article && !usable ? "below MIN_TEXT_LENGTH " : "") +
      `rawTextLen=${article?.textLength ?? 0} ` +
      baseNotes,
    ts,
  });
  emit(RESULTS, row);
  console.error(
    `    ${route} ts=${served} ${flag} -> ${row.ok ? "OK" : "fail"} ` +
      `${article?.textLength ?? 0}ch ${row.wordCount ?? 0}w ` +
      `${res.fromCache ? "(cache)" : `${res.latencyMs}ms`}`,
  );
  return {
    route,
    ok: row.ok,
    textLength: article?.textLength ?? 0,
    timestamp: served,
    flag,
  };
}

/** Production control: availability API -> newest/closest snapshot, id_ flag. */
async function runBaseline(item: CorpusItem): Promise<AttemptOutcome | null> {
  const probeId = "P3-baseline-availability";
  const url = item.canonicalUrl!;
  const ts = new Date().toISOString();
  const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  let res: FetchResult;
  try {
    res = await politeFetch(apiUrl, { ua: "polite", budget, timeoutMs: 15_000 });
  } catch (e) {
    if (e instanceof RateLimitAbort) throw e;
    emit(RESULTS, {
      ...scoreExtraction({
        probeId, item, route: "availability-newest", article: null,
        subrequests: 1, error: (e as Error).message, ts,
      }),
    });
    return null;
  }
  noteRateLimit(res);
  let closest: { available?: boolean; timestamp?: string } | undefined;
  try {
    closest = (JSON.parse(res.body) as {
      archived_snapshots?: { closest?: { available?: boolean; timestamp?: string } };
    }).archived_snapshots?.closest;
  } catch {
    /* fall through to no-snapshot row */
  }
  if (!res.ok || !closest?.available || !closest.timestamp) {
    emit(RESULTS, {
      ...scoreExtraction({
        probeId, item, route: "availability-newest", article: null,
        httpStatus: res.status, latencyMs: res.latencyMs, subrequests: 1,
        notes: `no snapshot available cache=${res.fromCache ? 1 : 0}`, ts,
      }),
    });
    console.error(`    availability -> no snapshot (http ${res.status})`);
    return null;
  }
  // Production URL shape: <archive>/web/<ts>id_/<url> (see worker/lib/wayback.ts).
  return attemptSnapshot(
    probeId, item, "availability-newest",
    `https://web.archive.org/web/${closest.timestamp}id_/${url}`,
    closest.timestamp, "id_", 1, "src=availability",
  );
}

/** Challenger: CDX capture list -> earliest/mid/latest id_ + one if_ variant. */
async function runCdxMulti(item: CorpusItem): Promise<{
  attempts: AttemptOutcome[];
  latestCapture: string | null;
}> {
  const probeId = "P3-cdx-multi";
  const url = item.canonicalUrl!;
  const ts = new Date().toISOString();
  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}` +
    `&output=json&filter=statuscode:200&collapse=digest&limit=40`;
  let res: FetchResult;
  try {
    res = await politeFetch(cdxUrl, { ua: "polite", budget, timeoutMs: 15_000 });
  } catch (e) {
    if (e instanceof RateLimitAbort) throw e;
    emit(RESULTS, {
      ...scoreExtraction({
        probeId, item, route: "cdx-query", article: null,
        subrequests: 1, error: (e as Error).message, ts,
      }),
    });
    return { attempts: [], latestCapture: null };
  }
  noteRateLimit(res);
  let captures: Capture[] = [];
  if (res.ok && res.body.trim()) {
    try {
      const rows = JSON.parse(res.body) as string[][];
      captures = rows
        .slice(1) // first row is the field-name header
        .map((r) => ({ timestamp: r[1], original: r[2], mimetype: r[3] }))
        .filter((c) => !c.mimetype || /html/i.test(c.mimetype))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    } catch {
      /* empty */
    }
  }
  if (captures.length === 0) {
    emit(RESULTS, {
      ...scoreExtraction({
        probeId, item, route: "cdx-query", article: null,
        httpStatus: res.status, latencyMs: res.latencyMs, subrequests: 1,
        notes: `no 200 html captures cache=${res.fromCache ? 1 : 0}`, ts,
      }),
    });
    console.error(`    cdx -> 0 captures (http ${res.status})`);
    return { attempts: [], latestCapture: null };
  }

  const latestCapture = captures[captures.length - 1].timestamp;
  console.error(
    `    cdx -> ${captures.length} captures ${captures[0].timestamp}..${latestCapture}`,
  );

  // Diverse candidates: earliest (pre-paywall-era proxy — publishedAt is null
  // for RSS items), mid, latest. Dedupe by timestamp, cap at 3 id_ fetches.
  const picks = new Map<string, { pos: string; c: Capture }>();
  const pick = (pos: string, c: Capture) => {
    if (!picks.has(c.timestamp)) picks.set(c.timestamp, { pos, c });
  };
  pick("earliest", captures[0]);
  pick("latest", captures[captures.length - 1]);
  pick("mid", captures[Math.floor(captures.length / 2)]);

  const attempts: AttemptOutcome[] = [];
  let first = true;
  for (const { pos, c } of [...picks.values()].slice(0, 3)) {
    attempts.push(
      await attemptSnapshot(
        probeId, item, `cdx-${pos}`,
        `https://web.archive.org/web/${c.timestamp}id_/${c.original}`,
        c.timestamp, "id_",
        first ? 1 : 0, // amortize the CDX query onto the first attempt
        `pos=${pos} captures=${captures.length} newest=${c.timestamp === latestCapture ? 1 : 0}`,
      ),
    );
    first = false;
  }
  // 4th attempt: the if_ flag on the latest candidate, to see if the flag
  // (not the timestamp) is what matters.
  const ifTarget = captures[captures.length - 1];
  attempts.push(
    await attemptSnapshot(
      probeId, item, "cdx-latest-if",
      `https://web.archive.org/web/${ifTarget.timestamp}if_/${ifTarget.original}`,
      ifTarget.timestamp, "if_", 0,
      `pos=latest captures=${captures.length} newest=1`,
    ),
  );
  return { attempts, latestCapture };
}

async function main(): Promise<void> {
  const byId = new Map(loadPublishers().map((i) => [i.id, i]));
  const items = SELECTED_IDS.map((id) => byId.get(id)).filter(
    (i): i is CorpusItem => Boolean(i),
  );
  console.error(`P3 wayback-cdx over ${items.length} article URLs`);

  const summary: Array<{
    id: string;
    class: string;
    baselineOk: boolean;
    cdxOk: boolean;
    winner: string | null;
    winnerTs: string | null;
    nonNewestWin: boolean;
  }> = [];

  try {
    for (const item of items) {
      const remaining = BUDGET_PER_HOST - usedOn("web.archive.org");
      if (remaining < WORST_CASE_PER_ARTICLE) {
        console.error(
          `\nBudget nearly exhausted (${remaining} left on web.archive.org) — stopping.`,
        );
        break;
      }
      console.error(`  ${item.class} ${item.publisherHost} ${item.id}`);
      const baseline = await runBaseline(item);
      const { attempts, latestCapture } = await runCdxMulti(item);

      const all = [...(baseline ? [baseline] : []), ...attempts];
      const okOnes = all.filter((a) => a.ok);
      const winner =
        okOnes.length > 0
          ? okOnes.reduce((a, b) => (b.textLength > a.textLength ? b : a))
          : null;
      const cdxOk = attempts.some((a) => a.ok);
      const nonNewestWin = Boolean(
        winner &&
          winner.route.startsWith("cdx-") &&
          latestCapture &&
          winner.timestamp !== latestCapture &&
          !(baseline?.ok ?? false),
      );
      summary.push({
        id: item.id,
        class: item.class,
        baselineOk: baseline?.ok ?? false,
        cdxOk,
        winner: winner ? `${winner.route}@${winner.timestamp}${winner.flag}` : null,
        winnerTs: winner?.timestamp ?? null,
        nonNewestWin,
      });
    }
  } catch (e) {
    if (e instanceof RateLimitAbort) {
      console.error("\nABORT: repeated 429/503 from archive.org — stopping run.");
    } else if (/budget exhausted/i.test((e as Error).message)) {
      console.error(`\nABORT: ${(e as Error).message}`);
    } else {
      throw e;
    }
  }

  console.error("\nBudget used:", JSON.stringify(budget.report()));
  console.error("Per-article summary:");
  for (const s of summary) {
    console.error(
      `  ${s.class} ${s.id} baseline=${s.baselineOk ? "OK" : "fail"} ` +
        `cdx=${s.cdxOk ? "OK" : "fail"} winner=${s.winner ?? "none"}` +
        (s.nonNewestWin ? " [NON-NEWEST WIN]" : ""),
    );
  }
  console.error(`\nWrote results to ${RESULTS}`);
}

main();
