import type { Env } from "../cloudflare";
import { errorResponse } from "../lib/errors";
import { resolveArticle, type Deps } from "../lib/resolve-article";
import { parseAppleNewsUrl } from "../../shared/apple-news-url";

export type { Deps };

export async function handleResolve(
  request: Request,
  env: Env,
  deps: Deps,
): Promise<Response> {
  const input = new URL(request.url).searchParams.get("url") ?? "";
  const parsed = parseAppleNewsUrl(input);
  if (!parsed) {
    return errorResponse("invalid_url", "Not an Apple News link");
  }

  const result = await resolveArticle(parsed, env, deps);
  if (!result.ok) {
    return errorResponse(result.code, result.message);
  }

  return Response.json(result.data, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
