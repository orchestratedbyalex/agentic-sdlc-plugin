# CLAUDE.md

Tiny zero-dependency Node ESM command-line tool: prints a greeting (`src/cli.mjs`).

## Commands

```bash
npm test           # node --test 'spec/*.check.mjs' (unit tests)
npm start          # smoke command: node src/cli.mjs Ada
```

This is an interpreted project: there is **no build step** — no bundling, no
compilation, nothing is emitted to dist/. The deployable artifact is the source tree
itself, exercised via the smoke command above.

There is no linter, type checker, or formatter configured. No runtime dependencies —
`npm install` is unnecessary. `npm audit` has nothing to scan (no lockfile, no deps).

## Layout

- `src/greet.mjs` — greeting formatting
- `src/cli.mjs` — the CLI entry point
- `spec/` — unit tests (node:test)
