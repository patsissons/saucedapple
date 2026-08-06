import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom/worker";
import { absolutizeHtml } from "./absolutize";

export interface ExtractedArticle {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  html: string;
  textLength: number;
}

// Strip heavy non-content blocks before parsing — Readability ignores them
// anyway and the Workers free plan has a tight CPU budget.
const PRESTRIP_RE =
  /<(script|style|svg|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1>|<link\b[^>]*\/?>/gi;

/**
 * Run Readability over raw publisher HTML. Returns null when no readable
 * article content is found. The returned html is NOT sanitized — the
 * client must sanitize before rendering.
 */
export function extractArticle(
  html: string,
  sourceUrl: string,
): ExtractedArticle | null {
  const stripped = html.replace(PRESTRIP_RE, "");
  const { document } = parseHTML(stripped);

  const article = new Readability(document as unknown as Document, {
    charThreshold: 250,
  }).parse();
  if (!article?.content || !article.textContent) return null;

  return {
    title: article.title?.trim() || null,
    byline: article.byline?.trim() || null,
    excerpt: article.excerpt?.trim() || null,
    html: absolutizeHtml(article.content, sourceUrl),
    textLength: article.textContent.trim().length,
  };
}
