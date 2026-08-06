// P2 STRUCTURED-DATA / CMS-API EXTRACTION LADDER — can we get FULL article text
// out of publisher pages WITHOUT running Readability over rendered HTML, by
// reading the text publishers already ship in structured form for SEO/CMS
// reasons? Metered ("class B") sites in particular must serve full text to
// Google, and the cheapest place they do it is JSON-LD `articleBody`.
//
// Routes tried per item, in ladder order, off ONE chrome fetch:
//   1. jsonld-articlebody  — <script type="application/ld+json"> articleBody
//   2. next-data           — <script id="__NEXT_DATA__"> deep body-string search
//   3. arc-fusion          — Fusion.globalContent content_elements[] (Arc XP)
//   4. amp                 — <link rel="amphtml"> then re-run 1-3 on the AMP doc
// Plus, ONLY for items the plain chrome fetch could not even load (class C
// blocks), a small UA/header matrix as extra routes:
//   5. googlebot-ua        — retry with the Googlebot UA, then route 1
//   6. google-referer      — retry chrome + Referer: google.com, then route 1
//
// The matrix routes are measured to be honest about the metered-paywall bypass
// question, not because they are shippable. Note that major publishers verify
// Googlebot by reverse DNS (crawl-*.googlebot.com) and increasingly hard-fail
// UA spoofing from non-Google IPs — expect these to trend toward 0% and to be
// ToS-hostile even where they work. Cloudflare Workers egress is emphatically
// not a Google IP.
//
//   npx tsx research/probes/02-structured-data/run.ts

import type { ExtractedArticle } from "../../../worker/lib/extract/extract.ts";
import { loadGold, loadPublishers } from "../../lib/corpus.ts";
import { politeFetch, type FetchResult } from "../../lib/fetcher.ts";
import { emit } from "../../lib/metrics.ts";
import { scoreExtraction } from "../../lib/score.ts";

const PROBE_ID = "P2-structured-data";
const RESULTS = new URL("../../results/02-structured-data.jsonl", import.meta.url)
  .pathname;
const MAX_BODY_BYTES = 1_500_000; // matches production
const TIMEOUT_MS = 12_000;
/** A body-ish string shorter than this is a teaser/dek, not an article. */
const MIN_BODY_CHARS = 1_000;

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** JSON.parse, retrying once with raw control characters escaped (publishers
 * routinely emit literal newlines inside JSON-LD strings, which is invalid). */
function tolerantParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  // Escape raw control characters that are illegal inside JSON strings.
  const patched = raw.replace(
    /[\u0000-\u001f]/g,
    (c) =>
      c === "\n"
        ? "\\n"
        : c === "\r"
          ? "\\r"
          : c === "\t"
            ? "\\t"
            : " ",
  );
  try {
    return JSON.parse(patched);
  } catch {
    return null;
  }
}

/** Does this string read like article prose (not markup soup, JS, or base64)? */
function looksLikeProse(s: string): boolean {
  if (s.length < MIN_BODY_CHARS) return false;
  const text = s.replace(/<[^>]+>/g, " ");
  const words = text.trim().split(/\s+/);
  if (words.length < 150) return false;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters / text.length < 0.6) return false;
  const avgWord = letters / words.length;
  if (avgWord > 12) return false; // minified JS / tokens / base64
  return /[.!?]["')\]]?(\s|$)/.test(text);
}

/** Turn an articleBody-ish string into article HTML. */
function bodyToHtml(body: string): string {
  if (/<\/(p|div|h[1-6]|li)>/i.test(body)) return body;
  const paras = body
    .split(/\n+|(?:\r\n)+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const parts = paras.length > 0 ? paras : [body.trim()];
  return parts.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
}

function buildArticle(
  body: string,
  meta: { title?: unknown; byline?: unknown; excerpt?: unknown } = {},
): ExtractedArticle {
  const trimmed = body.trim();
  return {
    title: asText(meta.title),
    byline: asText(meta.byline),
    excerpt: asText(meta.excerpt),
    html: bodyToHtml(trimmed),
    textLength: trimmed.length,
  };
}

function asText(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    const parts = v.map(asText).filter(Boolean) as string[];
    return parts.length ? parts.join(", ") : null;
  }
  if (v && typeof v === "object") {
    const name = (v as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim() || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route 1 — JSON-LD articleBody
// ---------------------------------------------------------------------------

const LD_SCRIPT_RE =
  /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;

const ARTICLE_TYPES = new Set([
  "article",
  "newsarticle",
  "reportagenewsarticle",
  "analysisnewsarticle",
  "backgroundnewsarticle",
  "opinionnewsarticle",
  "reviewnewsarticle",
  "report",
  "blogposting",
  "liveblogposting",
  "socialmediaposting",
  "techarticle",
  "scholarlyarticle",
  "advertisercontentarticle",
]);

function isArticleNode(node: Record<string, unknown>): boolean {
  const t = node["@type"];
  const types = Array.isArray(t) ? t : [t];
  return types.some(
    (x) => typeof x === "string" && ARTICLE_TYPES.has(x.toLowerCase()),
  );
}

/** Flatten every JSON-LD node reachable from a parsed block (arrays, @graph). */
function flattenLd(value: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 8 || value == null) return out;
  if (Array.isArray(value)) {
    for (const v of value) flattenLd(v, out, depth + 1);
    return out;
  }
  if (typeof value !== "object") return out;
  const node = value as Record<string, unknown>;
  out.push(node);
  if (node["@graph"]) flattenLd(node["@graph"], out, depth + 1);
  // Some CMSs nest the article under mainEntity / itemListElement.
  if (node.mainEntity) flattenLd(node.mainEntity, out, depth + 1);
  if (node.mainEntityOfPage && typeof node.mainEntityOfPage === "object") {
    flattenLd(node.mainEntityOfPage, out, depth + 1);
  }
  if (node.itemListElement) flattenLd(node.itemListElement, out, depth + 1);
  return out;
}

function extractJsonLd(html: string): ExtractedArticle | null {
  LD_SCRIPT_RE.lastIndex = 0;
  const nodes: Record<string, unknown>[] = [];
  for (const m of html.matchAll(LD_SCRIPT_RE)) {
    const parsed = tolerantParse(m[1].trim());
    if (parsed) flattenLd(parsed, nodes);
  }
  let best: { body: string; node: Record<string, unknown> } | null = null;
  for (const node of nodes) {
    const raw = node.articleBody;
    const body = typeof raw === "string" ? raw : asText(raw) ?? "";
    if (!body || body.trim().length < 200) continue;
    // Prefer an Article-typed node, then the longest body.
    const better =
      !best ||
      body.length > best.body.length ||
      (isArticleNode(node) && !isArticleNode(best.node));
    if (better) best = { body, node };
  }
  if (!best) return null;
  return buildArticle(best.body, {
    title: best.node.headline ?? best.node.name,
    byline: best.node.author ?? best.node.creator,
    excerpt: best.node.description,
  });
}

// ---------------------------------------------------------------------------
// Route 2 — __NEXT_DATA__ deep body search
// ---------------------------------------------------------------------------

const NEXT_DATA_RE =
  /<script\b[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i;
const BODY_KEY_RE = /(^|[._-])(body|content|articlebody|text|bodyhtml|richtext)($|[._-]?)/i;

interface BodyHit {
  key: string;
  value: string;
}

/** Pull a paragraph-ish string out of one CMS block node ({type,text} /
 * {type,content} / BBC-style {type,model:{text}}). */
function blockText(node: unknown): string | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const obj = node as Record<string, unknown>;
  for (const holder of [obj, obj.model as Record<string, unknown> | undefined]) {
    if (!holder || typeof holder !== "object") continue;
    for (const k of ["text", "content", "html", "body", "paragraph"]) {
      const v = holder[k];
      if (typeof v === "string" && v.trim().length >= 20) return v.trim();
    }
  }
  return null;
}

/** Deep-walk a parsed JSON tree for the longest article body it holds, in
 * either shape: one long prose string under a body/content/text-ish key, or an
 * array of paragraph blocks. Node-budgeted so a multi-MB CMS blob can't stall.
 * Double-encoded JSON (a JSON string whose content is itself JSON — BBC's
 * `__INITIAL_DATA__` does this) is unwrapped and walked too. */
function findBodyString(root: unknown, budget = { nodes: 400_000 }): BodyHit | null {
  let best: BodyHit | null = null;
  const offer = (key: string, value: string): void => {
    if (value.length < MIN_BODY_CHARS || !looksLikeProse(value)) return;
    if (!best || value.length > best.value.length) best = { key, value };
  };
  const walk = (value: unknown, key: string, depth: number): void => {
    if (depth > 30 || budget.nodes-- <= 0 || value == null) return;
    if (typeof value === "string") {
      if (BODY_KEY_RE.test(key)) offer(key, value);
      // Double-encoded JSON payload — unwrap and keep walking.
      if (value.length > MIN_BODY_CHARS && /^\s*[{[]/.test(value)) {
        const inner = tolerantParse(value);
        if (inner && typeof inner === "object") walk(inner, key, depth + 1);
      }
      return;
    }
    if (Array.isArray(value)) {
      if (value.length >= 3) {
        // Array of paragraph strings, or of CMS block objects.
        const parts = value.every((v) => typeof v === "string")
          ? (value as string[])
          : (value.map(blockText).filter(Boolean) as string[]);
        if (parts.length >= 3) {
          const joined = parts.join("\n\n");
          if (joined.length / parts.length >= 40) offer(`${key}[]`, joined);
        }
      }
      for (const v of value) walk(v, key, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, k, depth + 1);
    }
  };
  walk(root, "$", 0);
  return best;
}

function extractNextData(html: string): { article: ExtractedArticle; key: string } | null {
  const m = NEXT_DATA_RE.exec(html);
  if (!m) return null;
  const parsed = tolerantParse(m[1].trim());
  if (!parsed) return null;
  const hit = findBodyString(parsed);
  if (!hit) return null;
  return { article: buildArticle(hit.value), key: hit.key };
}

// ---------------------------------------------------------------------------
// Route 2b — embedded-state (EXTENSION beyond the specified ladder)
//
// __NEXT_DATA__ is only one hydration container and it appears on ZERO of the
// 42 corpus pages (Next's App Router dropped it, and most news CMSs never used
// it). The same deep-search works against whatever container the site actually
// ships, so this route generalizes route 2 to: every
// <script type="application/json"> block, plus every `window.__FOO__ = …`
// hydration assignment (BBC `__INITIAL_DATA__`, Condé Nast
// `__PRELOADED_STATE__`, NYT `__ETCHED_CACHE__`, …).
// ---------------------------------------------------------------------------

const JSON_SCRIPT_RE =
  /<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
const WINDOW_STATE_RE = /window\s*\.\s*(__[A-Za-z0-9_]+__)\s*=\s*/g;
/** Skip obviously non-content hydration blobs (config/env/consent). */
const BORING_STATE_RE = /CONFIG|ENVIRONMENT|CONSENT|ADS?|TRACK|GTM|REQUEST_CONTEXT/i;
const MAX_BLOB_CHARS = 3_000_000;

interface Blob {
  source: string;
  raw: string;
}

function candidateBlobs(html: string): Blob[] {
  const blobs: Blob[] = [];
  JSON_SCRIPT_RE.lastIndex = 0;
  let i = 0;
  for (const m of html.matchAll(JSON_SCRIPT_RE)) {
    const raw = m[1].trim();
    if (raw.length > 200 && raw.length < MAX_BLOB_CHARS) {
      blobs.push({ source: `json-script#${i}`, raw });
    }
    i++;
  }
  WINDOW_STATE_RE.lastIndex = 0;
  for (const m of html.matchAll(WINDOW_STATE_RE)) {
    const name = m[1];
    if (BORING_STATE_RE.test(name)) continue;
    let start = m.index + m[0].length;
    while (start < html.length && /\s/.test(html[start])) start++;
    const ch = html[start];
    let raw: string | null = null;
    if (ch === "{" || ch === "[") {
      raw = sliceBalanced(html, start);
    } else if (ch === '"') {
      // Double-encoded: window.__X__ = "{\"…\"}"
      const end = findStringEnd(html, start);
      raw = end > 0 ? html.slice(start, end) : null;
    }
    if (raw && raw.length > 200 && raw.length < MAX_BLOB_CHARS) {
      blobs.push({ source: `window.${name}`, raw });
    }
  }
  return blobs;
}

function findStringEnd(src: string, start: number): number {
  let esc = false;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (esc) esc = false;
    else if (c === "\\") esc = true;
    else if (c === '"') return i + 1;
  }
  return -1;
}

function extractEmbeddedState(
  html: string,
): { article: ExtractedArticle; note: string } | null {
  let best: { article: ExtractedArticle; note: string; len: number } | null = null;
  for (const blob of candidateBlobs(html)) {
    let parsed = tolerantParse(blob.raw);
    if (typeof parsed === "string") parsed = tolerantParse(parsed);
    if (!parsed || typeof parsed !== "object") continue;
    const hit = findBodyString(parsed);
    if (!hit) continue;
    if (!best || hit.value.length > best.len) {
      best = {
        article: buildArticle(hit.value),
        note: `${blob.source}:${hit.key}`,
        len: hit.value.length,
      };
    }
  }
  return best ? { article: best.article, note: best.note } : null;
}

// ---------------------------------------------------------------------------
// Route 3 — Arc XP Fusion.globalContent
// ---------------------------------------------------------------------------

const FUSION_RE = /(?:window\s*\.\s*)?Fusion\s*\.\s*globalContent\s*=\s*/;

/** Scan a balanced JSON object/array starting at `start` (must be { or [). */
function sliceBalanced(src: string, start: number): string | null {
  const open = src[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/** Concatenate Arc content_elements[] of type "text" (recursively, so nested
 * lists / oembeds with their own element arrays are picked up too). */
function collectArcText(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || node == null) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectArcText(n, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  if (obj.type === "text" && typeof obj.content === "string" && obj.content.trim()) {
    out.push(obj.content.trim());
  }
  if (Array.isArray(obj.content_elements)) {
    collectArcText(obj.content_elements, out, depth + 1);
  }
  if (Array.isArray(obj.items)) collectArcText(obj.items, out, depth + 1);
  return out;
}

function extractArcFusion(html: string): ExtractedArticle | null {
  let start = -1;
  const m = FUSION_RE.exec(html);
  if (m) {
    start = m.index + m[0].length;
  } else {
    const alt = html.indexOf('"globalContent":');
    if (alt >= 0) start = alt + '"globalContent":'.length;
  }
  if (start < 0) return null;
  while (start < html.length && /\s/.test(html[start])) start++;
  const json = sliceBalanced(html, start);
  if (!json) return null;
  const parsed = tolerantParse(json);
  if (!parsed || typeof parsed !== "object") return null;
  const content = collectArcText(parsed);
  if (content.length === 0) return null;
  const body = content.join("\n\n");
  const obj = parsed as Record<string, unknown>;
  const headlines = obj.headlines as Record<string, unknown> | undefined;
  const credits = obj.credits as Record<string, unknown> | undefined;
  const description = obj.description as Record<string, unknown> | undefined;
  return buildArticle(body, {
    title: headlines?.basic ?? obj.headline,
    byline: credits?.by,
    excerpt: description?.basic,
  });
}

// ---------------------------------------------------------------------------
// Route 4 — AMP
// ---------------------------------------------------------------------------

const AMPHTML_RE =
  /<link\b[^>]*rel\s*=\s*["']amphtml["'][^>]*>|<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']amphtml["'][^>]*>/i;

function findAmpUrl(html: string, baseUrl: string): string | null {
  const m = AMPHTML_RE.exec(html);
  if (!m) return null;
  const href = m[1] ?? /href\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Run the structured routes over a document; returns the first that fires. */
function runStructuredRoutes(
  html: string,
): { via: string; article: ExtractedArticle } | null {
  const ld = extractJsonLd(html);
  if (ld) return { via: "jsonld-articlebody", article: ld };
  const next = extractNextData(html);
  if (next) return { via: `next-data(${next.key})`, article: next.article };
  const arc = extractArcFusion(html);
  if (arc) return { via: "arc-fusion", article: arc };
  const state = extractEmbeddedState(html);
  if (state) return { via: `embedded-state(${state.note})`, article: state.article };
  return null;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

interface RouteRow {
  route: string;
  article: ExtractedArticle | null;
  cpuMsParse: number;
  httpStatus?: number;
  bytes?: number;
  latencyMs?: number;
  notes?: string;
  error?: string;
}

async function main(): Promise<void> {
  const items = loadPublishers();
  const gold = loadGold();
  console.error(`P2 structured-data over ${items.length} publisher URLs\n`);

  let anyOk = 0;
  for (const item of items) {
    const ts = new Date().toISOString();
    const url = item.canonicalUrl!;
    const rows: RouteRow[] = [];
    let subrequests = 0;

    let res: FetchResult | null = null;
    try {
      res = await politeFetch(url, {
        ua: "chrome",
        maxBytes: MAX_BODY_BYTES,
        timeoutMs: TIMEOUT_MS,
      });
      subrequests++;
    } catch (e) {
      emit(RESULTS, {
        ...scoreExtraction({
          probeId: PROBE_ID,
          item,
          route: "fetch",
          article: null,
          error: (e as Error).message,
          subrequests: 1,
          ts,
        }),
      });
      console.error(`  ${item.class} ${item.publisherHost} -> ERR ${(e as Error).message}`);
      continue;
    }

    const httpMeta = {
      httpStatus: res.status,
      bytes: res.bytes,
      latencyMs: res.latencyMs,
    };

    if (res.ok) {
      // --- Route 1: JSON-LD articleBody --------------------------------------
      let t0 = performance.now();
      const ld = extractJsonLd(res.body);
      rows.push({
        route: "jsonld-articlebody",
        article: ld,
        cpuMsParse: performance.now() - t0,
        ...httpMeta,
      });

      // --- Route 2: __NEXT_DATA__ -------------------------------------------
      t0 = performance.now();
      const next = extractNextData(res.body);
      rows.push({
        route: "next-data",
        article: next?.article ?? null,
        cpuMsParse: performance.now() - t0,
        notes: next ? `key=${next.key}` : undefined,
        ...httpMeta,
      });

      // --- Route 2b: embedded hydration state (extension) --------------------
      t0 = performance.now();
      const state = extractEmbeddedState(res.body);
      rows.push({
        route: "embedded-state",
        article: state?.article ?? null,
        cpuMsParse: performance.now() - t0,
        notes: state ? state.note : undefined,
        ...httpMeta,
      });

      // --- Route 3: Arc XP Fusion -------------------------------------------
      t0 = performance.now();
      const arc = extractArcFusion(res.body);
      rows.push({
        route: "arc-fusion",
        article: arc,
        cpuMsParse: performance.now() - t0,
        ...httpMeta,
      });

      // --- Route 4: AMP, re-running routes 1-3 on the AMP document -----------
      const ampUrl = findAmpUrl(res.body, res.finalUrl);
      if (ampUrl && ampUrl !== res.finalUrl) {
        try {
          const amp = await politeFetch(ampUrl, {
            ua: "chrome",
            maxBytes: MAX_BODY_BYTES,
            timeoutMs: TIMEOUT_MS,
          });
          subrequests++;
          t0 = performance.now();
          const hit = amp.ok ? runStructuredRoutes(amp.body) : null;
          rows.push({
            route: "amp",
            article: hit?.article ?? null,
            cpuMsParse: performance.now() - t0,
            httpStatus: amp.status,
            bytes: amp.bytes,
            latencyMs: amp.latencyMs,
            notes: hit ? `via=${hit.via}` : `amp http ${amp.status}`,
          });
        } catch (e) {
          rows.push({
            route: "amp",
            article: null,
            cpuMsParse: 0,
            error: (e as Error).message,
          });
        }
      }
    } else {
      rows.push({
        route: "jsonld-articlebody",
        article: null,
        cpuMsParse: 0,
        notes: "blocked/non-ok before parse",
        ...httpMeta,
      });

      // --- UA / header matrix, ONLY for pages the plain fetch could not load.
      // Kept off the happy path so this never balloons request counts.
      // Googlebot is verified by reverse DNS at every major publisher, so this
      // increasingly just fails from a non-Google IP (and would be ToS-hostile
      // even where it works).
      const matrix: Array<{ route: string; opts: Parameters<typeof politeFetch>[1] }> = [
        { route: "googlebot-ua", opts: { ua: "googlebot" } },
        {
          route: "google-referer",
          opts: { ua: "chrome", headers: { referer: "https://www.google.com/" } },
        },
      ];
      for (const { route, opts } of matrix) {
        try {
          const alt = await politeFetch(url, {
            ...opts,
            maxBytes: MAX_BODY_BYTES,
            timeoutMs: TIMEOUT_MS,
          });
          subrequests++;
          const t0 = performance.now();
          const article = alt.ok ? extractJsonLd(alt.body) : null;
          rows.push({
            route,
            article,
            cpuMsParse: performance.now() - t0,
            httpStatus: alt.status,
            bytes: alt.bytes,
            latencyMs: alt.latencyMs,
            notes: alt.ok ? undefined : `http ${alt.status}`,
          });
        } catch (e) {
          rows.push({
            route,
            article: null,
            cpuMsParse: 0,
            error: (e as Error).message,
          });
        }
      }
    }

    const scored = rows.map((r) =>
      scoreExtraction({
        probeId: PROBE_ID,
        item,
        route: r.route,
        article: r.article,
        gold: gold.get(item.id),
        httpStatus: r.httpStatus,
        bytes: r.bytes,
        latencyMs: r.latencyMs,
        cpuMsParse: r.cpuMsParse,
        subrequests,
        notes: r.notes,
        error: r.error,
        ts,
      }),
    );
    for (const row of scored) emit(RESULTS, row);

    const winners = scored.filter((r) => r.ok);
    if (winners.length) anyOk++;
    const summary = winners.length
      ? `OK via ${winners.map((w) => `${w.route}:${w.wordCount}w`).join(", ")}`
      : `fail (${scored.map((r) => `${r.route}=${r.wordCount ?? 0}w`).join(" ")})`;
    console.error(`  ${item.class} ${item.publisherHost} -> ${summary}`);
  }

  console.error(`\n${anyOk}/${items.length} items succeeded on >=1 route`);
  console.error(`Wrote results to ${RESULTS}`);
}

main();
