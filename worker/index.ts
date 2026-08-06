import type { Env, ExecutionContext } from "./cloudflare";
import { getDefaultCache } from "./lib/cache";
import { errorResponse } from "./lib/errors";
import { handleResolve, type Deps } from "./routes/resolve";

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
      case "/api/health":
        return Response.json({ ok: true });
      case "/api/resolve":
        return handleResolve(request, env, deps);
      default:
        return errorResponse("not_found", "Unknown API route");
    }
  },
};
