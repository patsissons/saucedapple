# Agent working rules

## Stack

pnpm + TypeScript + React + Vite + Tailwind v4 + shadcn/ui, tested with
Vitest (unit, in `src/`) and Playwright (e2e, in `e2e/`), linted with ESLint,
formatted with Prettier.

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
- Add shadcn/ui components with `pnpm dlx shadcn@latest add <component>`.

## After making changes from a prompt, BEFORE committing

1. **Author new tests** covering the changes being made.
2. **Update any documentation** affected by the changes (README.md, this
   file, and anything else that describes the changed behavior).
3. **Run `pnpm format-and-validate`** and repair any regressions in-line.
   This includes the Playwright e2e suite — never skip it; this app
   regresses on e2e much more easily than on unit tests.

Only commit once `pnpm format-and-validate` is fully green.
