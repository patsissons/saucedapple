import { parseArticleParams } from "../../shared/apple-news-url";
import type { Env } from "../cloudflare";
import { injectArticleMeta } from "../lib/meta";
import { resolveArticle, type Deps } from "../lib/resolve-article";

/**
 * Serve index.html for "/", injecting article-specific OpenGraph tags when
 * a valid ?id= permalink resolves (social crawlers don't run JS, so this
 * must happen server-side). Anything invalid or unresolvable falls back to
 * the static page with the site-default tags.
 */
export async function handleRoot(
  request: Request,
  env: Env,
  deps: Deps,
): Promise<Response> {
  const serveStatic = () => env.ASSETS.fetch(request.url);

  const parsed = parseArticleParams(new URL(request.url).searchParams);
  if (!parsed) return serveStatic();

  let resolved;
  try {
    resolved = await resolveArticle(parsed, env, deps);
  } catch {
    return serveStatic();
  }
  if (!resolved.ok) return serveStatic();

  // Advertise the canonical ?id= permalink even when reached via a legacy
  // ?url= link, so social platforms cache one URL per article rather than two.
  const canonical = new URL(request.url);
  canonical.search = "";
  canonical.searchParams.set("id", parsed.id);

  const asset = await serveStatic();
  const html = injectArticleMeta(
    await asset.text(),
    resolved.data,
    canonical.href,
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
