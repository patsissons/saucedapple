import type { Env, ExecutionContext } from "./cloudflare";
import { getDefaultCache } from "./lib/cache";
import { errorResponse } from "./lib/errors";
import { handleExtract } from "./routes/extract";
import { handleResolve, type Deps } from "./routes/resolve";
import { handleRoot } from "./routes/root";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    const deps: Deps = {
      fetch: globalThis.fetch,
      cache: getDefaultCache(),
      waitUntil: (promise) => ctx.waitUntil(promise),
    };

    switch (pathname) {
      case "/":
        return handleRoot(request, env, deps);
      case "/api/health":
        return Response.json({ ok: true });
      case "/api/resolve":
        return handleResolve(request, env, deps);
      case "/api/extract":
        return handleExtract(request, env, deps);
      default:
        return errorResponse("not_found", "Unknown API route");
    }
  },
};
