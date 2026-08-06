import type { Env, ExecutionContext } from "./cloudflare";

export default {
  async fetch(
    request: Request,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health") {
      return Response.json({ ok: true });
    }

    return Response.json(
      { error: { code: "not_found", message: "Unknown API route" } },
      { status: 404 },
    );
  },
};
