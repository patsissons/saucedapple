# Agent working rules

## Stack

pnpm + TypeScript + React + Vite + Tailwind v4 + shadcn/ui, tested with
Vitest (unit, in `src/`) and Playwright (e2e, in `e2e/`), linted with ESLint,
formatted with Prettier.

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
