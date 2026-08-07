import { absolutizeHtml } from "./absolutize";
import type { ExtractedArticle } from "./extract";

// Many publishers ship the full article body in schema.org JSON-LD for SEO.
// Reading it is ~150x cheaper than a Readability parse (0.2ms vs 31ms median,
// measured in research/probes/02-structured-data), which matters on the
// Workers free plan. It changes no success/failure outcome — every page that
// carries a usable articleBody is one Readability also handles — so this is a
// CPU fast-path, never a coverage lever. Readability stays the fallback
// because articleBody routinely omits subheads, pull quotes and captions.

const SCRIPT_RE =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const ARTICLE_TYPES = new Set([
  "Article",
  "NewsArticle",
  "ReportageNewsArticle",
  "BackgroundNewsArticle",
  "OpinionNewsArticle",
  "AnalysisNewsArticle",
  "ReviewNewsArticle",
  "Report",
  "BlogPosting",
]);

interface JsonLdNode {
  "@type"?: string | string[];
  "@graph"?: unknown;
  articleBody?: unknown;
  headline?: unknown;
  description?: unknown;
  author?: unknown;
}

function isArticleType(type: JsonLdNode["@type"]): boolean {
  if (typeof type === "string") return ARTICLE_TYPES.has(type);
  if (Array.isArray(type)) return type.some((t) => ARTICLE_TYPES.has(t));
  return false;
}

/** Flatten arrays and @graph containers into a single node list. */
function collectNodes(value: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as JsonLdNode;
  out.push(node);
  if (node["@graph"]) collectNodes(node["@graph"], out);
}

/**
 * Publishers routinely emit raw newlines and tabs inside JSON-LD string
 * literals, which is invalid JSON. Retry with those escaped before giving up.
 */
function parseLoose(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(
        raw.replace(/[\n\r\t]/g, (c) =>
          c === "\n" ? "\\n" : c === "\r" ? "\\r" : "\\t",
        ),
      );
    } catch {
      return null;
    }
  }
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
}

function toHtml(articleBody: string): string {
  return articleBody
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

/**
 * Pull an article out of a page's JSON-LD. Returns null when no Article-typed
 * node carries an articleBody — the caller then falls back to Readability.
 */
export function extractJsonLdArticle(
  html: string,
  sourceUrl: string,
): ExtractedArticle | null {
  let best: { body: string; node: JsonLdNode } | null = null;

  for (const match of html.matchAll(SCRIPT_RE)) {
    const parsed = parseLoose(match[1]);
    if (!parsed) continue;

    const nodes: JsonLdNode[] = [];
    collectNodes(parsed, nodes);

    for (const node of nodes) {
      if (!isArticleType(node["@type"])) continue;
      const body =
        typeof node.articleBody === "string" ? node.articleBody.trim() : "";
      if (!body) continue;
      if (!best || body.length > best.body.length) best = { body, node };
    }
  }

  if (!best) return null;

  const html_ = toHtml(best.body);
  if (!html_) return null;

  return {
    title: firstString(best.node.headline),
    byline: firstString(best.node.author),
    excerpt: firstString(best.node.description),
    html: absolutizeHtml(html_, sourceUrl),
    textLength: best.body.length,
  };
}
