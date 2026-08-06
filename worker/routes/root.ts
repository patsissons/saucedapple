import { parseAppleNewsUrl } from "../../shared/apple-news-url";
import type { Env } from "../cloudflare";
import { injectArticleMeta } from "../lib/meta";
import { resolveArticle, type Deps } from "../lib/resolve-article";

/**
 * Serve index.html for "/", injecting article-specific OpenGraph tags when
 * a valid ?url= permalink resolves (social crawlers don't run JS, so this
 * must happen server-side). Anything invalid or unresolvable falls back to
 * the static page with the site-default tags.
 */
export async function handleRoot(
  request: Request,
  env: Env,
  deps: Deps,
): Promise<Response> {
  const serveStatic = () => env.ASSETS.fetch(request.url);

  const input = new URL(request.url).searchParams.get("url");
  if (!input) return serveStatic();

  const parsed = parseAppleNewsUrl(input);
  if (!parsed) return serveStatic();

  let resolved;
  try {
    resolved = await resolveArticle(parsed, env, deps);
  } catch {
    return serveStatic();
  }
  if (!resolved.ok) return serveStatic();

  const asset = await serveStatic();
  const html = injectArticleMeta(
    await asset.text(),
    resolved.data,
    request.url,
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
