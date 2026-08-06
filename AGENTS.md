# Agent working rules

## Stack

pnpm + TypeScript + React + Vite + Tailwind v4 + shadcn/ui, with a
Cloudflare Worker backend ("Workers with static assets" via
@cloudflare/vite-plugin, config in wrangler.jsonc). Tested with Vitest
(unit: `src/`, `worker/`, `shared/`) and Playwright (e2e: `e2e/`), linted
with ESLint, formatted with Prettier.

- TypeScript runs side-by-side per the official TS 7 guidance: `tsc` (and
  `pnpm typecheck`) is the native TS 7 compiler via the `@typescript/native`
  alias, while the `typescript` package is aliased to
  `@typescript/typescript6` — the final JS-API release — because
  typescript-eslint requires the TS 6 API. Do not "simplify" this to a single
  `typescript` dependency: plain `typescript@7` breaks ESLint, and plain
  `typescript@6` loses the native compiler. Drop the dual setup only once
  typescript-eslint supports TS 7 natively
  (https://github.com/typescript-eslint/typescript-eslint/issues/10940).
- TS 7 removed `baseUrl` — keep `paths` entries relative to the repo root.
- Vitest runs with globals off — always import `describe`/`it`/`expect` from
  `vitest` in test files.
- `vitest.setup.ts` registers Testing Library `cleanup()` explicitly; do not
  remove it — without it, rendered components leak across tests.
- Worker types come from a ~20-line shim (`worker/cloudflare.d.ts`), NOT
  `@cloudflare/workers-types` — the generated globals conflict with the DOM
  lib in our single shared tsconfig.
- Add shadcn/ui components with `pnpm dlx shadcn@latest add <component>`.

## Product invariants

- **Sanitization**: `ExtractResponse.html` is untrusted publisher markup and
  is deliberately NOT sanitized server-side. Never render it without passing
  it through `sanitizeArticleHtml()` (src/lib/sanitize.ts).
- **Archives are linked, never fetched server-side** — archive.today
  rate-limits and blocks server fetchers; only the Wayback Machine
  (availability API + raw snapshots) may be fetched from the Worker.
- **Free to operate**: no paid APIs or services, ever. Cloudflare free tier
  limits apply (~10ms CPU per request) — extraction keeps its body cap and
  script pre-strip for this reason.
- E2e is hermetic: the Worker reads upstream origins from wrangler `e2e` env
  vars, served by `e2e/mocks/upstream.mjs`. Never let e2e depend on the real
  apple.news. When adding upstream behavior, extend the mock.
- Parsing fixtures in `worker/lib/__fixtures__/` are recorded from the live
  site (prettier-ignored) — don't reformat or hand-edit the recorded ones.

## Deploying

`pnpm run deploy` (NOT bare `pnpm deploy` — that's pnpm's workspace
command). Requires `wrangler login`. Custom domains saucedapple.com /
www.saucedapple.com are declared in wrangler.jsonc.

## After making changes from a prompt, BEFORE committing

1. **Author new tests** covering the changes being made.
2. **Update any documentation** affected by the changes (README.md, this
   file, and anything else that describes the changed behavior).
3. **Run `pnpm format-and-validate`** and repair any regressions in-line.
   This includes the Playwright e2e suite — never skip it; this app
   regresses on e2e much more easily than on unit tests.

Only commit once `pnpm format-and-validate` is fully green.
