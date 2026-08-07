# sauced apple

**saucedapple.com** — paste an [Apple News](https://apple.news) link, get free
ways to read the story: the publisher's own page, public archive snapshots,
and a best-effort extracted transcript. No Apple News subscription, no
account, no tracking. Results are permalinkable via `/?url=<apple.news link>`.

## How it works

apple.news pages embed the publisher's canonical URL and article metadata,
but serve no CORS headers — so a Cloudflare Worker does the fetching:

- `GET /api/resolve?url=` — fetches the apple.news page once and returns
  `{ canonicalUrl, title, publisher, description, image }`. Articles without
  a publisher website (Apple News+ exclusives) return `canonicalUrl: null`.
- `GET /api/extract?url=` — best-effort article text: fetches the publisher
  page (falling back to a Wayback Machine snapshot when blocked or
  paywalled) and runs Readability over it. Returns unsanitized HTML — the
  client sanitizes with DOMPurify before rendering.
  Extraction tries schema.org JSON-LD `articleBody` first (far cheaper than a
  full parse) and falls back to Readability.
- `GET /api/related?url=` — other outlets covering the same story, from Bing
  News RSS (each result names its outlet and carries the publisher's real URL,
  so the links go straight to the article). Shown when no transcript can be
  extracted, so those articles end somewhere useful instead of a dead end.
  **Google News is not usable here**: it serves Cloudflare Workers a 503 bot
  page, verified from a deployed Worker.
- **Opt-in reader service**: when extraction fails, the user can choose to send
  the article's address to [r.jina.ai](https://jina.ai/reader/), which renders
  and extracts it. It's opt-in because it hands the URL and the reader's IP to a
  third party and only recovers a small share of articles (**+3 of 42** measured;
  **zero** on hard paywalls). jina returns the whole page as markdown, so
  `src/lib/jina.ts` gates on genuine article prose — otherwise subscription and
  footer chrome would render as a "transcript".
- Alternative reading links (archive.today, Wayback, Google) are built
  client-side from the resolve payload; archives are linked, never proxied.

The same Worker serves the React SPA as static assets (Cloudflare "Workers
with static assets" via `@cloudflare/vite-plugin`). Responses are cached for
24h with the Cache API.

**Known limitation**: hard-paywalled publishers (WSJ, FT, The Economist) block
every free route — server fetch, Wayback, and the client-side reader, which
returns only subscription/footer boilerplate for them. For those, the
alternative links (especially archive.today, which executes JS when capturing,
opened by a human) are the way to read the story. See AGENTS.md before
"fixing" this.

## Setup

Requires [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) (the
version is pinned in the `packageManager` field of `package.json`).

```sh
pnpm install
pnpm exec playwright install chromium # browsers for the e2e suite
```

## Scripts

| Script                     | What it does                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`                 | Vite dev server with the Worker running in workerd (`/api/*` works)              |
| `pnpm build`               | Build the SPA + Worker into `dist/`                                              |
| `pnpm preview`             | Serve the production build locally                                               |
| `pnpm test`                | Run unit tests once (Vitest)                                                     |
| `pnpm test:watch`          | Run unit tests in watch mode                                                     |
| `pnpm test:e2e`            | Playwright e2e — fully hermetic, boots a local mock of apple.news/archives       |
| `pnpm format`              | Format all files with Prettier                                                   |
| `pnpm format:check`        | Check formatting without writing                                                 |
| `pnpm typecheck`           | Type-check with `tsc --noEmit` (native TS 7)                                     |
| `pnpm lint`                | Lint with ESLint                                                                 |
| `pnpm validate:quick`      | Format check + type check + lint + unit tests — quick validation of code changes |
| `pnpm validate`            | `validate:quick`, then the Playwright e2e suite — used for CI/CD                 |
| `pnpm format-and-validate` | Prettier format (write), then `validate` — run this before committing            |

## Layout

- `worker/` — Cloudflare Worker: API routes, apple.news parsing, extraction
  pipeline (linkedom + Readability), Wayback fallback. Fixtures recorded from
  the live site live in `worker/lib/__fixtures__/`.
- `shared/` — types and URL validation used by both the Worker and the SPA.
- `src/` — React SPA (Tailwind v4 + shadcn/ui).
- `e2e/` — Playwright specs plus `e2e/mocks/upstream.mjs`, a dependency-free
  mock of apple.news/publisher/Wayback; the Worker points at it via the
  wrangler `e2e` environment (`CLOUDFLARE_ENV=e2e`).

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR and on pushes
to `main`:

- **validate** — `pnpm validate` (format check, typecheck, lint, unit tests,
  hermetic Playwright e2e) plus a production build. Required to merge:
  `main` is protected, so changes land via PR with this check green.
- **Deploy** (`.github/workflows/deploy.yml`) — builds and runs
  `wrangler deploy`, publishing to saucedapple.com. CI calls it
  automatically after validate passes on `main` pushes; it can also be
  dispatched manually (Actions → Deploy → Run workflow), optionally with a
  commit SHA — the rollback path: `gh workflow run deploy.yml -f sha=<sha>`.
  Requires the `CLOUDFLARE_API_TOKEN` repo secret (a Cloudflare API token
  created from the "Edit Cloudflare Workers" template; set with
  `gh secret set CLOUDFLARE_API_TOKEN`).

## Deploying

The app deploys as a single Cloudflare Worker (SPA assets + API) to
**saucedapple.com** (custom domains are declared in `wrangler.jsonc` and
provisioned on first deploy — the zone must exist on the Cloudflare
account).

```sh
pnpm exec wrangler login   # once
pnpm run deploy            # build + wrangler deploy
```

Note it must be `pnpm run deploy` — bare `pnpm deploy` is pnpm's built-in
workspace command, not this script. No secrets or paid services are
required; everything runs on the Workers free tier.

Deploys normally happen automatically when a PR merges to `main` (see
CI/CD above) — manual deploys are for emergencies.

## Testing notes

- Vitest runs with globals **off** — tests import `describe`/`it`/`expect`
  from `vitest` explicitly.
- `vitest.setup.ts` registers Testing Library's `cleanup()` in an `afterEach`
  because the automatic cleanup only self-registers when test globals exist.
- Worker/shared tests run in node (`// @vitest-environment node` pragma);
  component tests run in jsdom.
- E2e never touches the real network.

## TypeScript setup

Type checking uses the native TypeScript 7 compiler (`@typescript/native`
alias → `typescript@7`), while the `typescript` package name is aliased to
`@typescript/typescript6` so tools that need the TS 6 JS API (currently
typescript-eslint) keep working. This is the side-by-side arrangement from
the official TypeScript 7 release notes; see AGENTS.md before changing it.
