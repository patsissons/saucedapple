// P5 SYNDICATION MIRROR HUNT — when the exact article is paywalled (class
// B/C), the SAME story is often published in full and OPEN elsewhere: wire
// copy (AP/Reuters/AFP) reprinted by Yahoo/MSN/AOL/regional outlets, or the
// piece syndicated verbatim. This probe measures how often a paywalled
// article can be converted into a fully-readable open copy of the SAME story:
//   1. pull the TITLE off the paywalled page (og:title / JSON-LD / <title>,
//      falling back to the URL slug — titles survive paywalls);
//   2. flag WIRE copy (Associated Press / Reuters / AFP byline);
//   3. search Google News RSS for the title, keep candidates whose source is
//      on a small allowlist of known-open hosts;
//   4. resolve the news.google.com redirect link, fetch the mirror, extract
//      with the production extractor, and gate success on harness
//      titleMatches + MIN_TEXT_LENGTH.
//
//   npx tsx research/probes/05-syndication/run.ts
//
// Request budget per item (tracked honestly in `subrequests`):
//   1 title fetch + ≤2 Google News RSS searches + ≤3 mirror resolution/fetch
//   requests across ≤2 candidate mirrors.

import { extractArticle } from "../../../worker/lib/extract/extract.ts";
import { MIN_TEXT_LENGTH } from "../../../worker/lib/extract/detect.ts";
import { CLASS_A } from "../../corpus/publisher-classes.ts";
import { loadGold, loadPublishers, type CorpusItem } from "../../lib/corpus.ts";
import { politeFetch, type FetchResult } from "../../lib/fetcher.ts";
import { emit } from "../../lib/metrics.ts";
import { scoreExtraction } from "../../lib/score.ts";

const PROBE_ID = "P5-syndication";
const RESULTS = new URL("../../results/05-syndication.jsonl", import.meta.url)
  .pathname;
const MAX_BODY_BYTES = 1_500_000;

const MAX_SEARCHES_PER_ITEM = 2;
const MAX_MIRROR_FETCHES_PER_ITEM = 3;
const MAX_CANDIDATES_PER_ITEM = 2;
const MIN_CANDIDATE_SIM = 0.35;

/** Known-open hosts we are willing to fetch as mirrors. */
const ALLOWLIST = [
  "news.yahoo.com",
  "yahoo.com",
  "msn.com",
  "aol.com",
  "apnews.com",
  "reuters.com",
  ...CLASS_A,
];

function hostAllowed(host: string): boolean {
  const h = host.replace(/^www\./, "");
  return ALLOWLIST.some((a) => h === a || h.endsWith("." + a));
}

/** Short label for routes: news.yahoo.com -> yahoo, apnews.com -> apnews. */
function hostLabel(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : host;
}

// ---------------------------------------------------------------------------
// Title extraction off the (possibly paywalled/blocked) publisher page.

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  // Both attribute orders: property/name before content, and content first.
  const a = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
  );
  if (a) return decodeEntities(a[1]);
  const b = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    ),
  );
  return b ? decodeEntities(b[1]) : null;
}

function jsonLdHeadline(html: string): string | null {
  const m = html.match(/"headline"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return null;
  }
}

/** Strip a trailing " - Publisher" / " | Site" suffix when safely possible. */
function stripSiteSuffix(title: string): string {
  const parts = title.split(/\s+[|\u2013\u2014-]\s+/);
  if (parts.length > 1 && parts[0].split(/\s+/).length >= 5) return parts[0];
  return title;
}

/** Fall back to the URL slug when the page itself gives no title. */
function slugTitle(url: string): string | null {
  const segs = new URL(url).pathname.split("/").filter(Boolean);
  const last = segs[segs.length - 1]?.replace(/\.[a-z]+$/i, "");
  if (!last) return null;
  const words = last
    .split("-")
    .filter((w) => !/^\d+$/.test(w) && !/^[0-9a-f]{6,}$/i.test(w));
  if (words.length < 4) return null;
  return words.join(" ");
}

function pageTitle(html: string, url: string): { title: string | null; via: string } {
  const og = metaContent(html, "og:title") ?? metaContent(html, "twitter:title");
  if (og) return { title: stripSiteSuffix(og), via: "og" };
  const ld = jsonLdHeadline(html);
  if (ld) return { title: ld, via: "jsonld" };
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t) {
    const cleaned = stripSiteSuffix(decodeEntities(t[1]));
    // Bare site names ("The New York Times") are not article titles.
    if (cleaned.split(/\s+/).length >= 5) return { title: cleaned, via: "title" };
  }
  const slug = slugTitle(url);
  if (slug) return { title: slug, via: "slug" };
  return { title: null, via: "none" };
}

/** Wire-copy detection: AP/Reuters/AFP in byline/author/body. */
function detectWire(html: string): string | null {
  const author =
    (metaContent(html, "author") ?? "") +
    " " +
    (html.match(/"author"\s*:\s*(\{[^}]*\}|\[[^\]]*\])/)?.[1] ?? "");
  const scopes = [author, html];
  for (const [re, label] of [
    [/associated press/i, "ap"],
    [/\breuters\b/i, "reuters"],
    [/agence france|\bAFP\b/, "afp"],
  ] as const) {
    if (re.test(scopes[0])) return label;
  }
  if (/associated press/i.test(scopes[1])) return "ap";
  return null;
}

// ---------------------------------------------------------------------------
// Google News RSS search + redirect-link resolution.

interface Candidate {
  googleLink: string;
  title: string;
  sourceHost: string;
  sim: number;
}

const STOP = new Set(
  "the a an of to in on for and or is are was were as at by with after amid over from its his her their says say said new how why what".split(
    " ",
  ),
);

function tokens(s: string): string[] {
  return [
    ...new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  ];
}

/** Fraction of the expected title's significant tokens present in candidate. */
function titleSim(expected: string, candidate: string): number {
  const exp = tokens(expected);
  if (exp.length === 0) return 0;
  const cand = new Set(tokens(candidate));
  const hit = exp.filter((w) => cand.has(w)).length;
  return hit / exp.length;
}

function parseRssItems(
  xml: string,
): Array<{ title: string; link: string; sourceHost: string }> {
  const out: Array<{ title: string; link: string; sourceHost: string }> = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const rawTitle =
      block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ??
      "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const sourceUrl = block.match(/<source[^>]*url="([^"]+)"/)?.[1] ?? "";
    let sourceHost = "";
    try {
      sourceHost = new URL(sourceUrl).hostname;
    } catch {
      /* ignore */
    }
    if (link) out.push({ title: decodeEntities(rawTitle), link, sourceHost });
  }
  return out;
}

async function searchGoogleNews(
  query: string,
  expectedTitle: string,
): Promise<Candidate[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await politeFetch(url, { ua: "chrome", timeoutMs: 12_000 });
  if (!res.ok) return [];
  return parseRssItems(res.body).map((i) => ({
    googleLink: i.link,
    title: i.title,
    sourceHost: i.sourceHost,
    sim: titleSim(expectedTitle, i.title),
  }));
}

/**
 * Old-format news.google.com/rss/articles/CBMi... ids are base64url protobuf
 * with the target URL embedded as a printable string. New-format (AU_yqL...)
 * ids are opaque; return null and let the caller fall back to following the
 * redirect page.
 */
function decodeGoogleNewsLink(link: string): string | null {
  const m = link.match(/\/(?:rss\/)?articles\/([^?/]+)/);
  if (!m) return null;
  try {
    const raw = Buffer.from(
      m[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("latin1");
    const u = raw.match(/https?:\/\/[\x21-\x7e]+/);
    if (!u) return null;
    // Protobuf strings are length-prefixed; the char after the URL is
    // non-printable so the regex already stops there. Trim stray punctuation.
    return u[0].replace(/["'\\]+$/, "");
  } catch {
    return null;
  }
}

/** Any allowlisted, non-Google article URL present in an interstitial body. */
function scanForAllowlistedUrl(body: string): string | null {
  for (const m of body.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)) {
    try {
      const u = new URL(m[0]);
      if (u.hostname.includes("google")) continue;
      if (u.pathname.length > 10 && hostAllowed(u.hostname)) return m[0];
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------

function isArticleUrl(url: string): boolean {
  const path = new URL(url).pathname;
  if (path === "/" || path === "") return false;
  if (path.includes("/feed/")) return false;
  return path.split("/").filter(Boolean).length >= 2;
}

interface MirrorFetch {
  res: FetchResult;
  how: string;
  requests: number;
}

/** Resolve a google redirect link to an allowlisted mirror and fetch it. */
async function fetchMirror(
  cand: Candidate,
  fetchesLeft: number,
): Promise<MirrorFetch | { res: null; how: string; requests: number }> {
  let requests = 0;
  const decoded = decodeGoogleNewsLink(cand.googleLink);
  if (decoded && hostAllowed(new URL(decoded).hostname)) {
    requests++;
    const res = await politeFetch(decoded, {
      ua: "chrome",
      maxBytes: MAX_BODY_BYTES,
      timeoutMs: 12_000,
    });
    return { res, how: "decode", requests };
  }
  if (fetchesLeft < 1) return { res: null, how: "budget", requests };
  // Follow the news.google.com redirect page.
  requests++;
  const g = await politeFetch(cand.googleLink, {
    ua: "chrome",
    maxBytes: MAX_BODY_BYTES,
    timeoutMs: 12_000,
    redirect: "follow",
  });
  const finalHost = new URL(g.finalUrl).hostname;
  if (!finalHost.endsWith("news.google.com")) {
    if (hostAllowed(finalHost)) return { res: g, how: "redirect", requests };
    return { res: null, how: `redirect-offlist:${finalHost}`, requests };
  }
  // Interstitial page: scan for the target URL, fetch it if allowlisted.
  const target = scanForAllowlistedUrl(g.body);
  if (target && fetchesLeft >= 2) {
    requests++;
    const res = await politeFetch(target, {
      ua: "chrome",
      maxBytes: MAX_BODY_BYTES,
      timeoutMs: 12_000,
    });
    return { res, how: "interstitial-scan", requests };
  }
  return { res: null, how: "unresolvable-google-link", requests };
}

async function main(): Promise<void> {
  const items = loadPublishers({ classes: ["B", "C"] });
  const gold = loadGold();
  console.error(`P5 syndication hunt over ${items.length} class-B/C URLs`);

  for (const item of items) {
    const ts = new Date().toISOString();
    const url = item.canonicalUrl!;
    let subrequests = 0;
    try {
      if (!isArticleUrl(url)) {
        emit(RESULTS, {
          ...scoreExtraction({
            probeId: PROBE_ID,
            item,
            route: "skip",
            article: null,
            subrequests,
            notes: "index/feed URL — no single story to mirror",
            ts,
          }),
        });
        console.error(`  ${item.class} ${item.id} -> skip (index/feed)`);
        continue;
      }

      // 1. Title (and wire flag) off the paywalled page.
      subrequests++;
      const page = await politeFetch(url, {
        ua: "chrome",
        maxBytes: MAX_BODY_BYTES,
        timeoutMs: 12_000,
      });
      const { title, via } = pageTitle(page.body, url);
      let wire = detectWire(page.body);
      if (!title) {
        emit(RESULTS, {
          ...scoreExtraction({
            probeId: PROBE_ID,
            item,
            route: "no-title",
            article: null,
            httpStatus: page.status,
            subrequests,
            notes: `no usable title (http ${page.status}, via=${via})`,
            ts,
          }),
        });
        console.error(`  ${item.class} ${item.id} -> no title (http ${page.status})`);
        continue;
      }

      // 2-3. Google News RSS search, allowlist-filtered candidates.
      subrequests++;
      let all = await searchGoogleNews(title, title);
      let candidates = all
        .filter((c) => c.sourceHost && hostAllowed(c.sourceHost))
        .filter((c) => c.sim >= MIN_CANDIDATE_SIM)
        .sort((a, b) => b.sim - a.sim);
      let searches = 1;
      if (candidates.length === 0 && searches < MAX_SEARCHES_PER_ITEM) {
        subrequests++;
        searches++;
        const scoped = await searchGoogleNews(
          `${title} site:news.yahoo.com`,
          title,
        );
        candidates = scoped
          .filter((c) => c.sim >= MIN_CANDIDATE_SIM)
          .map((c) => ({ ...c, sourceHost: c.sourceHost || "news.yahoo.com" }))
          .filter((c) => hostAllowed(c.sourceHost))
          .sort((a, b) => b.sim - a.sim);
        all = all.concat(scoped);
      }
      // If the wire service itself carries the story, that's the best mirror.
      if (wire === null) {
        const wireCand = candidates.find(
          (c) =>
            /(^|\.)(apnews\.com|reuters\.com)$/.test(
              c.sourceHost.replace(/^www\./, ""),
            ) && c.sim >= 0.6,
        );
        if (wireCand) wire = "search-suggests-wire";
      }
      const meta = `title="${title}" via=${via} wire=${wire ?? "no"} rssItems=${all.length} cands=${candidates.length}`;

      if (candidates.length === 0) {
        emit(RESULTS, {
          ...scoreExtraction({
            probeId: PROBE_ID,
            item,
            route: "search",
            article: null,
            httpStatus: page.status,
            subrequests,
            notes: `${meta} — no allowlisted candidates`,
            ts,
          }),
        });
        console.error(`  ${item.class} ${item.id} -> no candidates (${all.length} rss items) [${title.slice(0, 50)}]`);
        continue;
      }

      // 4. Fetch up to 2 candidate mirrors; stop on first success.
      let mirrorFetches = 0;
      let success = false;
      // Prefer distinct hosts across the two attempts.
      const picked: Candidate[] = [];
      for (const c of candidates) {
        if (picked.length >= MAX_CANDIDATES_PER_ITEM) break;
        if (picked.some((p) => p.sourceHost === c.sourceHost)) continue;
        picked.push(c);
      }
      for (const cand of picked) {
        if (mirrorFetches >= MAX_MIRROR_FETCHES_PER_ITEM) break;
        const mf = await fetchMirror(
          cand,
          MAX_MIRROR_FETCHES_PER_ITEM - mirrorFetches,
        );
        mirrorFetches += mf.requests;
        subrequests += mf.requests;
        const label = hostLabel(
          mf.res ? new URL(mf.res.finalUrl).hostname : cand.sourceHost,
        );
        if (!mf.res || !mf.res.ok) {
          emit(RESULTS, {
            ...scoreExtraction({
              probeId: PROBE_ID,
              item: { ...item, title },
              route: `mirror:${label}`,
              article: null,
              httpStatus: mf.res?.status,
              latencyMs: mf.res?.latencyMs,
              subrequests,
              notes: `${meta} sim=${cand.sim.toFixed(2)} how=${mf.how}${mf.res ? "" : " — unresolved"}`,
              ts,
            }),
          });
          continue;
        }
        const t0 = performance.now();
        const article = extractArticle(mf.res.body, mf.res.finalUrl);
        const cpuMsParse = performance.now() - t0;
        const usable =
          article && article.textLength >= MIN_TEXT_LENGTH ? article : null;
        const row = scoreExtraction({
          probeId: PROBE_ID,
          // Carry the recovered title so the harness title gate applies:
          // success requires the mirror to be the SAME story.
          item: { ...item, title },
          route: `mirror:${label}`,
          article: usable,
          gold: gold.get(item.id),
          httpStatus: mf.res.status,
          bytes: mf.res.bytes,
          latencyMs: mf.res.latencyMs,
          cpuMsParse,
          subrequests,
          notes: `${meta} sim=${cand.sim.toFixed(2)} how=${mf.how} mirrorUrl=${mf.res.finalUrl.slice(0, 120)}${article && !usable ? " — below MIN_TEXT_LENGTH" : ""}`,
          ts,
        });
        emit(RESULTS, row);
        console.error(
          `  ${item.class} ${item.id} -> mirror:${label} ${row.ok ? "OK" : "fail"} ${row.wordCount ?? 0}w (sim=${cand.sim.toFixed(2)}, ${mf.how})`,
        );
        if (row.ok) {
          success = true;
          break;
        }
      }
      if (!success && picked.length > 0) {
        console.error(`  ${item.class} ${item.id} -> no mirror hit [${title.slice(0, 50)}]`);
      }
    } catch (e) {
      emit(RESULTS, {
        ...scoreExtraction({
          probeId: PROBE_ID,
          item,
          article: null,
          subrequests,
          error: (e as Error).message,
          ts,
        }),
      });
      console.error(`  ${item.class} ${item.id} -> ERR ${(e as Error).message}`);
    }
  }
  console.error(`\nWrote results to ${RESULTS}`);
}

main();
