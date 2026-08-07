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

## Brand and design rules

- The mark is a red apple with amber sauce dripping over it. It must NEVER
  resemble the Apple Inc. logo (no bitten-apple silhouettes, no monochrome
  apple glyphs) — that's a deliberate legal constraint, not taste.
- The same art lives in THREE places that must stay in sync:
  `public/favicon.svg`, `src/components/logo.tsx` (JSX attributes), and
  `assets/og-image.html`. After changing it, regenerate the social image:
  `pnpm exec playwright screenshot --viewport-size=1200,630 assets/og-image.html public/og-image.png`
- Accent usage: sauce amber (`amber-500` family; wired into `--primary`,
  `--accent`, `--ring` in src/index.css) is the interaction color. Primary
  buttons are solid amber; secondary controls (icon buttons, outline pills,
  ghost buttons) are NEUTRAL at rest and take amber text/border on hover
  only — the user explicitly rejected always-amber secondary controls.
- UI copy is sentence case ("Read transcript", "Sauce it!"); the wordmark
  is title case ("Sauced Apple") with "Sauced" in amber and "Apple" in red.

## Extraction limitations (learned the hard way — don't re-litigate)

- Bot-hardened paywalled publishers (WSJ-class) return 401 bot-blocks to
  ALL server-side fetches, and their pages (and even their Wayback
  snapshots) are JS shells with zero server-rendered text. No plain-fetch
  extractor can transcribe them; the links row (archive.today executes JS
  when capturing) is the intended path. This is expected behavior, not a
  bug.
- Do NOT pre-reject pages on the `isAccessibleForFree: false` JSON-LD
  marker — many sites declare it while shipping full text for SEO. The
  extracted-text-length gate (MIN_TEXT_LENGTH) is the real paywall signal.
- **Opt-in reader service (r.jina.ai)**: `src/lib/jina.ts`, wired into
  `src/components/reader-view.tsx`. Measured honestly it recovers **+3 of 42**
  test articles (50%→57%) and **0 of 9 hard paywalls** — a modest win, not a
  paywall bypass. Keep it **opt-in**: it discloses the article URL and reader's
  IP to a third party, which sits against the app's "no tracking" promise.
  Two more rules if you touch it:
  1. **Gate on article prose, never on length.** jina returns the WHOLE PAGE as
     markdown, so nav/subscription/consent/footer text will pass any length
     check and render as a fake "transcript" (the FT's entire output is
     "Then $75 per month… © THE FINANCIAL TIMES LTD"). An earlier research pass
     made exactly this mistake and wrongly concluded jina cracked paywalls.
  2. It is a third party that receives the reader's IP and article URL — weigh
     against the app's "no tracking" positioning; always degrade to alt-links.
     Note there is NO "residential IP" benefit: the browser cannot fetch publishers
     (CORS), so jina fetches from its own infra. Client-side buys only zero Worker
     CPU/subrequests.
- Cloudflare Browser Rendering runs on Cloudflare infra, so it inherits the same
  IP block; it is not a WSJ answer either. The archive.today link, opened by a
  human, remains the only realistic path for hard paywalls.

## Extraction ladder (what runs, in order)

1. Publisher page — JSON-LD `articleBody` fast-path, else Readability (Worker).
2. Wayback snapshot, same extractors (Worker).
3. **User-initiated** reader service (browser, opt-in — see above).
4. When all of the above fail: `/api/related` other-outlet coverage plus the
   alt-links row (publisher, archive.today, Wayback, Arquivo.pt, searches).

Roughly half of all articles cannot be transcribed by any free route, so rung 4
is not a consolation prize — it is the expected outcome for a large share of
traffic and deserves the same care as the extractors.

## Shipping changes

- INTENDED flow (protection pending, see below): land changes as
  branch → PR → green `validate` check → merge.
- Merging to `main` deploys automatically (CI calls the reusable Deploy
  workflow after validation). To roll back or redeploy a specific commit:
  `gh workflow run deploy.yml -f sha=<sha>`. Do not run `pnpm run deploy`
  locally except in emergencies (it needs `wrangler login`; NOT bare
  `pnpm deploy` — that's pnpm's workspace command).
- Custom domains saucedapple.com / www.saucedapple.com are declared in
  wrangler.jsonc. The workers.dev preview
  (saucedapple.patricksissons.workers.dev) serves the same deployment.

## Pending setup (2026-08-06 — remove this section when done)

Set up during a major GitHub Actions outage; two steps remain:

1. **Verify the automatic triggers.** No `push` or `pull_request` event has
   ever produced a CI run (only `workflow_dispatch` worked during the
   outage). Once Actions is healthy, run a trivial branch/PR through:
   confirm `validate` runs on the PR, merge, confirm the main push runs
   validate and then auto-calls Deploy.
2. **Apply branch protection** (only AFTER step 1 proves the checks
   report — protecting first would wedge all merges):
   `gh api -X PUT repos/patsissons/saucedapple/branches/main/protection`
   with required_status_checks `{strict: true, checks: [{context: "validate"}]}`,
   required_pull_request_reviews `{required_approving_review_count: 0}`,
   `enforce_admins: true`, no force pushes or deletions.

Until then, PRs are merged without a CI check after local
`pnpm format-and-validate` passes, and deploys are dispatched manually
(`gh workflow run deploy.yml`).

## After making changes from a prompt, BEFORE committing

1. **Author new tests** covering the changes being made.
2. **Update any documentation** affected by the changes (README.md, this
   file, and anything else that describes the changed behavior).
3. **Run `pnpm format-and-validate`** and repair any regressions in-line.
   This includes the Playwright e2e suite — never skip it; this app
   regresses on e2e much more easily than on unit tests.

Only commit once `pnpm format-and-validate` is fully green.
