// P1 APPLE-NATIVE — highest-ceiling bet: can we get FULL article text straight
// from Apple, credential-free? This is the ONLY route that could ever serve
// News+ exclusives (class D, no publisher canonical) and could bypass
// publisher paywalls entirely.
//
// HARD GATE (see research/README.md): this counts ONLY from a completely clean
// client with ZERO credentials. We never send a token, cookie, or auth header
// lifted from a signed-in News app — unauthenticated ≠ authorized, and using a
// real session token would both cross a legal line and invalidate the finding.
// Every request here is anonymous.
//
//   npx tsx research/probes/01-apple-native/run.ts

import { extractArticle } from "../../../worker/lib/extract/extract.ts";
import { MIN_TEXT_LENGTH } from "../../../worker/lib/extract/detect.ts";
import { loadCorpus } from "../../lib/corpus.ts";
import { politeFetch, type UAName } from "../../lib/fetcher.ts";
import { emit, type ProbeResult } from "../../lib/metrics.ts";

const PROBE_ID = "P1-apple-native";
const RESULTS = new URL("../../results/01-apple-native.jsonl", import.meta.url)
  .pathname;

interface RouteSpec {
  route: string;
  url: (id: string) => string;
  ua: UAName;
  headers?: Record<string, string>;
}

// The credential-free Apple surface, probed exhaustively. news-edge.apple.com
// is the News app's real API host; app.news, oEmbed, and embed variants are the
// public-facing shapes. All anonymous.
const ROUTES: RouteSpec[] = [
  { route: "page-json-accept", url: (id) => `https://apple.news/${id}`, ua: "iphone", headers: { accept: "application/json" } },
  { route: "page-applenews-ua", url: (id) => `https://apple.news/${id}`, ua: "appleNews" },
  { route: "edge-articles", url: (id) => `https://news-edge.apple.com/articles/${id}`, ua: "appleNews", headers: { accept: "application/json" } },
  { route: "edge-v1-articles", url: (id) => `https://news-edge.apple.com/v1/articles/${id}`, ua: "appleNews", headers: { accept: "application/json" } },
  { route: "edge-publisher-article", url: (id) => `https://news-edge.apple.com/publisher/article/${id}`, ua: "appleNews", headers: { accept: "application/json" } },
  { route: "oembed", url: (id) => `https://apple.news/oembed?url=${encodeURIComponent(`https://apple.news/${id}`)}`, ua: "chrome", headers: { accept: "application/json" } },
  { route: "embed-suffix", url: (id) => `https://apple.news/${id}/embed`, ua: "chrome" },
  { route: "amp-cdn", url: (id) => `https://apple.news/${id}?amp=1`, ua: "iphone" },
];

// Success requires REAL article prose, judged the same way as the rest of the
// harness (Readability textLength ≥ MIN_TEXT_LENGTH). A JS redirect shell — the
// 9KB page apple.news actually serves — yields null here, so it can't sneak
// through as a false positive. JSON responses carrying Apple News Format
// article components also count (the true "Apple-native content" win).
function looksLikeFullText(
  body: string,
  contentType: string,
  url: string,
): { words: number; hasArticleJson: boolean } {
  const hasArticleJson =
    /json/i.test(contentType) &&
    /"articleBody"|"components"\s*:\s*\[|"role"\s*:\s*"body"|application\/json\+anf/i.test(
      body,
    );
  const article = extractArticle(body, url);
  const words =
    article && article.textLength >= MIN_TEXT_LENGTH
      ? article.textLength
      : 0;
  return { words, hasArticleJson };
}

async function main(): Promise<void> {
  const items = loadCorpus();
  if (items.length === 0) {
    console.error("No apple.news corpus. Run resolve-corpus.ts first.");
    return;
  }
  console.error(`P1 over ${items.length} apple.news links, ${ROUTES.length} routes each`);

  for (const item of items) {
    let anySuccess = false;
    for (const spec of ROUTES) {
      const ts = new Date().toISOString();
      const url = spec.url(item.id);
      let row: ProbeResult;
      try {
        const res = await politeFetch(url, {
          ua: spec.ua,
          headers: spec.headers,
          timeoutMs: 8_000,
          redirect: "manual",
          noCache: true,
        });
        const ct = res.headers["content-type"] ?? "";
        const { words, hasArticleJson } = looksLikeFullText(res.body, ct, url);
        const ok = res.ok && (words > 0 || hasArticleJson);
        if (ok) anySuccess = true;
        row = {
          probeId: PROBE_ID,
          corpusId: item.id,
          class: item.class,
          route: spec.route,
          ok,
          httpStatus: res.status,
          bytes: res.bytes,
          textLength: words,
          latencyMs: res.latencyMs,
          subrequests: 1,
          notes: `ct=${ct.slice(0, 40)}${hasArticleJson ? " anf-json" : ""}`,
          ts,
        };
      } catch (e) {
        row = {
          probeId: PROBE_ID,
          corpusId: item.id,
          class: item.class,
          route: spec.route,
          ok: false,
          error: (e as Error).message,
          ts,
        };
      }
      emit(RESULTS, row);
    }
    console.error(`  ${item.class} ${item.id.slice(0, 12)} -> ${anySuccess ? "SOME FULLTEXT" : "no anonymous fulltext"}`);
  }
  console.error(`\nWrote results to ${RESULTS}`);
  console.error(
    "Reminder: a positive here still requires a ToS read + explicit user decision before shipping.",
  );
}

main();
