# saucedapple

A React web app built with Vite, TypeScript, Tailwind CSS, and shadcn/ui.

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
| `pnpm dev`                 | Start the Vite dev server for local development                                  |
| `pnpm build`               | Build the production bundle into `dist/`                                         |
| `pnpm preview`             | Serve the production build locally                                               |
| `pnpm test`                | Run unit tests once (Vitest)                                                     |
| `pnpm test:watch`          | Run unit tests in watch mode                                                     |
| `pnpm test:e2e`            | Run Playwright e2e tests (starts the dev server automatically)                   |
| `pnpm format`              | Format all files with Prettier                                                   |
| `pnpm format:check`        | Check formatting without writing                                                 |
| `pnpm typecheck`           | Type-check with `tsc --noEmit`                                                   |
| `pnpm lint`                | Lint with ESLint                                                                 |
| `pnpm validate:quick`      | Format check + type check + lint + unit tests — quick validation of code changes |
| `pnpm validate`            | `validate:quick`, then the Playwright e2e suite — used for CI/CD                 |
| `pnpm format-and-validate` | Prettier format (write), then `validate` — run this before committing            |

## Testing notes

- Vitest runs with globals **off** — tests import `describe`/`it`/`expect`
  from `vitest` explicitly.
- `vitest.setup.ts` registers Testing Library's `cleanup()` in an `afterEach`
  because the automatic cleanup only self-registers when test globals exist.
- Unit tests live next to the code in `src/`; e2e tests live in `e2e/`.
