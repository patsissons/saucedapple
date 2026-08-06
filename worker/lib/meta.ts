import type { ResolveResponse } from "../../shared/api";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// index.html writes property/name before content; keep that order there.
function setMeta(
  html: string,
  attr: "property" | "name",
  key: string,
  value: string,
): string {
  const re = new RegExp(
    `(<meta\\s+${attr}="${escapeRegExp(key)}"\\s+content=")[^"]*(")`,
    "i",
  );
  return html.replace(re, `$1${escapeAttr(value)}$2`);
}

function setTitle(html: string, value: string): string {
  return html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeAttr(value)}</title>`,
  );
}

/**
 * Rewrite the static OpenGraph/Twitter tags in index.html with
 * article-specific values for a /?url= permalink.
 */
export function injectArticleMeta(
  html: string,
  article: ResolveResponse,
  permalinkUrl: string,
): string {
  const title = article.title ?? "sauced apple";
  const fullTitle = article.publisher
    ? `${title} — ${article.publisher}`
    : title;
  const description =
    article.description ??
    `Free ways to read this Apple News story${article.publisher ? ` from ${article.publisher}` : ""}.`;
  const image = article.image ?? "https://saucedapple.com/og-image.png";

  let out = html;
  out = setTitle(out, `${title} · sauced apple`);
  out = setMeta(out, "name", "description", description);
  out = setMeta(out, "property", "og:type", "article");
  out = setMeta(out, "property", "og:title", fullTitle);
  out = setMeta(out, "property", "og:description", description);
  out = setMeta(out, "property", "og:url", permalinkUrl);
  out = setMeta(out, "property", "og:image", image);
  out = setMeta(out, "name", "twitter:title", fullTitle);
  out = setMeta(out, "name", "twitter:description", description);
  out = setMeta(out, "name", "twitter:image", image);
  return out;
}
