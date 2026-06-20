# Contributing to scroll-arrows

Thanks for your interest in improving `scroll-arrows`. This guide covers local
setup, the checks CI runs, and how releases flow.

## Dev setup

The published package runs on Node `>=18` (see `package.json` `engines`). For
local development we pin Node 24 via `.nvmrc` to match the build/publish job —
`nvm use` picks it up. Then:

```bash
npm ci
```

## Scripts

| Command                | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run demo`         | Vite playground at `/demo`                     |
| `npm test`             | Vitest (library + release tooling)             |
| `npm run coverage`     | Vitest + v8 coverage (pure logic gated at 90%) |
| `npm run lint`         | ESLint                                         |
| `npm run format:check` | Prettier check (use `npm run format` to fix)   |
| `npm run typecheck`    | `tsc --noEmit`                                 |
| `npm run build`        | tsup → `dist` (ESM + CJS + d.ts)               |

CI runs `lint`, `format:check`, `typecheck`, `coverage`, and `build`. Run them
locally before opening a PR.

## Branch flow

Development follows an automated **staging → main** flow:

1. Open feature PRs against `staging`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/) for PR
   titles — they drive the version bump (`feat:` → minor, `fix:`/other →
   patch, `!` or `BREAKING CHANGE` → major).
3. A single **"Release: staging to main"** PR is kept open automatically with a
   categorized summary and the proposed next version. Merging it to `main` tags
   the release and publishes to npm.

See the "Releasing" section of [`README.md`](./README.md) for the full release
pipeline.

## Pull requests

- Keep changes focused; one logical change per PR.
- Add or update tests for behavior changes.
- Ensure `lint`, `format:check`, `typecheck`, `coverage`, and `build` pass.
