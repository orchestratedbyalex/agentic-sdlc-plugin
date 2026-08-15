# First-time setup — greenfield & existing repos

Read by the /sdlc wizard only when Step 0's `mode` is `greenfield` or `existing` (never on
`resume`). Follow the branch that matches, then run the one-time model-profile pick, then
proceed to Phase 1.

## `greenfield` (empty folder)

Tell the user you'll help build from scratch. Collect a short brief by asking, one at a
time: (1) what the project does, (2) language/stack, (3) key features, (4) target users.
Then create the metadata file **deterministically** with the state script — do NOT
hand-write or hand-expand it:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" init --name "<project>" --version "0.1.0" --mode greenfield

**Verify** the output has `"ok": true` and `state.valid: true` before continuing (retry if
the write didn't land — e.g. it needed approval). Then record the brief **deterministically**
with the state script — do NOT hand-edit the YAML:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" brief --purpose "<...>" --stack "<...>" --users "<...>" --key-features "<...>"

**Then SCAFFOLD a minimal skeleton from the brief — BEFORE Phase 1.** The Prepare agents
*analyze existing code*, so an empty repo gives the read-only explorer nothing to work
with and the phase stalls. Create just enough real structure, matched to the stated stack:

- a manifest — `package.json` (Node/TS), `pyproject.toml` (Python), `Cargo.toml` (Rust),
  `go.mod` (Go), etc.;
- the language/build config (e.g. `tsconfig.json` for TypeScript);
- `src/` and `test/` directories, each with one minimal stub (e.g. `src/index.ts` with a
  placeholder export, and a placeholder test in `test/`);
- a short `README.md` derived from the brief (purpose, stack, planned features).

Keep it minimal — a seed, not the product. Then proceed to Phase 1, where the explorer
analyzes this skeleton and the CLAUDE.md author documents it.

## `existing` (code, no metadata)

Tell the user you'll set up the SDLC on their codebase. Ask for the project name (default:
the folder name) and a version (default `0.1.0`). Then create the metadata file
**deterministically** with the state script — do NOT hand-write it:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" init --name "<project>" --version "<version>" --mode existing

The command writes `docs/requirements/sdlc-metadata.yml` and prints `{ ok, state }`.
**Verify before proceeding:** confirm `"ok": true` and `state.mode: "resume"` with
`"valid": true`. If `ok` is false or the write needs approval, surface it and retry — do
NOT continue to Phase 1 until the file is confirmed written. Then proceed to Phase 1.

## Set the model profile (first-time setup only)

Only when you just ran `init` this turn — never on `resume`, where the profile already
persists. Before starting Phase 1, offer the one-time pick. The gates, reviewers and code
authors always run on the session model no matter what is chosen (they never downgrade —
invariant 9):

- **balanced** (recommended) — analysis/doc agents on Sonnet, mechanical agents on Haiku
- **quality** — every agent on the session model
- **economy** — analysis + mechanical agents on Haiku (cheapest)

`init` already wrote `balanced`. Only if the user picks differently, persist it
deterministically — never hand-edit the YAML (the guard hook denies it):

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" config --model-profile <quality|economy>
