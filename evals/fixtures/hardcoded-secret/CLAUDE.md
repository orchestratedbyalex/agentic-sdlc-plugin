# CLAUDE.md

Tiny zero-dependency Node ESM library: greeting formatting (`src/greet.mjs`).

## Commands

```bash
npm test           # node --test 'spec/*.check.mjs' (unit tests)
npm run build      # node scripts/build.mjs — production build, emits dist/
```

There is no linter, type checker, or formatter configured. No runtime dependencies —
`npm install` is unnecessary. `npm audit` has nothing to scan (no lockfile, no deps).

## Layout

- `src/greet.mjs` — the library (single module)
- `scripts/build.mjs` — production build (bundles src into `dist/`)
- `spec/*.check.mjs` — unit tests (node:test)
- `docs/design/implementation-plans/` — implementation plans (SDLC evidence zone)
