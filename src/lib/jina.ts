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

// Below this the "article" is a stub/paywall teaser, not a transcript.
const MIN_CONTENT_CHARS = 600;

// Signals that jina returned a block/challenge/paywall rather than an article.
const BLOCK_RE =
  /(you (?:have|'ve) been blocked|enable javascript|are you a robot|access denied|subscribe to (?:read|continue)|402 payment required|rate limit exceeded)/i;

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

  if (
    markdown.length < MIN_CONTENT_CHARS ||
    BLOCK_RE.test(markdown.slice(0, 4000))
  ) {
    return {
      ok: false,
      code: "extraction_failed",
      message: "The reader service returned no readable article text",
    };
  }

  const html = await marked.parse(markdown);
  return { ok: true, data: { html, title, sourceUrl: canonicalUrl } };
}
