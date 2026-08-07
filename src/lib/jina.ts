import { marked } from "marked";
import type { ApiResult } from "./api";

// Client-side reader fallback. When the Worker's own extraction fails or is
// blocked, the BROWSER asks r.jina.ai to fetch + render + extract the article
// to markdown. This runs from the user's residential IP (which routinely beats
// the Cloudflare Worker on publishers that block datacenter IP ranges) and
// costs the Worker zero CPU. r.jina.ai is CORS-open, so the fetch works from
// the app origin. It is a best-effort third-party service — always degrade to
// the alternative links when it fails.

const JINA_BASE = "https://r.jina.ai/";
const FETCH_TIMEOUT_MS = 30_000; // jina renders JS; it is seconds, not ms

// jina converts the WHOLE PAGE to markdown, so a paywalled article still comes
// back with hundreds of words of navigation, subscription offers, consent
// screens and footers. A naive length check therefore passes pure boilerplate
// as a "transcript" — the FT's output is entirely "Then $75 per month… © THE
// FINANCIAL TIMES LTD". We must measure ARTICLE PROSE, not document length.
const MIN_PARAGRAPH_CHARS = 100;
const MIN_ARTICLE_WORDS = 400;
const MIN_ARTICLE_PARAGRAPHS = 3;

// Boilerplate vocabulary, including consent/privacy walls (some publishers
// serve a long, prose-shaped CCPA/GDPR screen that clears any length gate).
const CHROME_RE =
  /\b(subscribe|subscriptions?|digital access|per month|per week|per year|cancel anytime|free trial|sign in|log in|create an account|newsletters?|cookies?|privacy (?:policy|center|rights)|personal information|targeted advertising|opt[- ]out|do not sell|consent|terms of (?:use|service)|all rights reserved|trademarks? of|registered office|vat reg|advertise with|follow us on|download the app|app store|google play|most popular|related stories|read more|share this|skip to content)\b/i;

const FOOTER_RE = /©|\ball rights reserved\b|\bregistered in england\b/i;

export interface ReaderExtract {
  html: string;
  title: string | null;
  sourceUrl: string;
}

/**
 * jina prefixes the article with a small metadata block:
 *   Title: …\nURL Source: …\nPublished Time: …\nMarkdown Content:\n<body>
 * Pull the title out and return just the body markdown.
 */
export function parseJinaMarkdown(raw: string): {
  title: string | null;
  markdown: string;
} {
  const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || null;
  const marker = "Markdown Content:";
  const idx = raw.indexOf(marker);
  const markdown = (idx >= 0 ? raw.slice(idx + marker.length) : raw).trim();
  return { title, markdown };
}

/** Markdown -> plain text, for judging whether a line is article prose. */
function toPlainText(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Split jina's markdown into what we render and what we judge it by.
 *
 * `prose` (long, non-chrome paragraphs) is the gate — it is what stops a
 * paywall stub, which is mostly subscription and footer text, from being
 * rendered as a transcript. `render` additionally keeps the article's own
 * headings so long pieces don't collapse into a wall of text; headings are
 * deliberately excluded from the gate so they can't pad a stub past it.
 */
export function articleLines(markdown: string): {
  render: string[];
  prose: string[];
} {
  const render: string[] = [];
  const prose: string[] = [];

  for (const line of markdown.split("\n")) {
    const text = toPlainText(line);
    if (!text) continue;
    if (CHROME_RE.test(text) || FOOTER_RE.test(text)) continue;

    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      render.push(line);
      continue;
    }
    if (text.length >= MIN_PARAGRAPH_CHARS) {
      render.push(line);
      prose.push(line);
    }
  }

  return { render, prose };
}

/**
 * Fetch a clean reader copy of `canonicalUrl` via r.jina.ai, from the browser.
 * Returns sanitizable HTML (the caller MUST still run sanitizeArticleHtml).
 */
export async function extractViaReader(
  canonicalUrl: string,
): Promise<ApiResult<ReaderExtract>> {
  let response: Response;
  try {
    response = await fetch(`${JINA_BASE}${canonicalUrl}`, {
      headers: { accept: "text/plain" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      code: "upstream_error",
      message: "The reader service could not be reached",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "extraction_failed",
      message: "The reader service could not read this article",
    };
  }

  const raw = await response.text();
  const { title, markdown } = parseJinaMarkdown(raw);

  const { render, prose } = articleLines(markdown);
  if (
    prose.length < MIN_ARTICLE_PARAGRAPHS ||
    countWords(prose.join(" ")) < MIN_ARTICLE_WORDS
  ) {
    return {
      ok: false,
      code: "extraction_failed",
      message: "The reader service returned no readable article text",
    };
  }

  // Render the article only — the chrome we just identified is dropped.
  const html = await marked.parse(render.join("\n\n"));
  return { ok: true, data: { html, title, sourceUrl: canonicalUrl } };
}
