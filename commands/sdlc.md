---
description: Agentic SDLC wizard — detect project state and drive the seven-phase lifecycle (Prepare to Operate).
argument-hint: "[optional: phase name or change request]"
---

# Agentic SDLC Wizard

## Step 0 — Detect project state

Your FIRST action: run the state detector with the Bash tool and read its JSON output. It
prints `{ mode, board, phase, agent, setupComplete, valid, modelProfile }` for the current
working directory:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs"
```

`${CLAUDE_PLUGIN_ROOT}` is this plugin's install directory; if your shell does not have it
set, substitute the absolute path of the folder that contains `scripts/sdlc-state.mjs`.

## Your job

You are the SDLC orchestrator. The JSON from Step 0 tells you the `mode`, the phase
`board`, the resume `phase`, the resume `agent`, and `setupComplete`. Use it — do not
re-derive state by hand.

User argument (may be empty): `$ARGUMENTS`

### Step 1 — Print the status board
Render the seven phases with the board statuses: `✓` completed, `→` the first
non-completed phase (next), `·` pending. Show `project` and `version` if present.

### Step 2 — Route on `mode`

- **`greenfield`** (empty folder): Tell the user you'll help build from scratch. Collect
  a short brief by asking, one at a time: (1) what the project does, (2) language/stack,
  (3) key features, (4) target users. Then create the metadata file **deterministically**
  with the state script — do NOT hand-write or hand-expand it:

      node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" init --name "<project>" --version "0.1.0" --mode greenfield

  **Verify** the output has `"ok": true` and `state.valid: true` before continuing (retry if
  the write didn't land — e.g. it needed approval). Then record the brief **deterministically**
  with the state script — do NOT hand-edit the YAML:

      node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" brief --purpose "<...>" --stack "<...>" --users "<...>" --key-features "<...>"

  **Then SCAFFOLD a minimal skeleton from the brief — BEFORE Phase 1.** The Prepare agents
  *analyze existing code*, so an empty repo gives the read-only explorer nothing to work
  with and the phase stalls. Create just enough real structure, matched to the stated stack:
    - a manifest — `package.json` (Node/TS), `pyproject.toml` (Python), `Cargo.toml`
      (Rust), `go.mod` (Go), etc.;
    - the language/build config (e.g. `tsconfig.json` for TypeScript);
    - `src/` and `test/` directories, each with one minimal stub (e.g. `src/index.ts`
      with a placeholder export, and a placeholder test in `test/`);
    - a short `README.md` derived from the brief (purpose, stack, planned features).
  Keep it minimal — a seed, not the product. Then proceed to Phase 1, where the explorer
  analyzes this skeleton and the CLAUDE.md author documents it.

- **`existing`** (code, no metadata): Tell the user you'll set up the SDLC on their
  codebase. Ask for the project name (default: the folder name) and a version (default
  `0.1.0`). Then create the metadata file **deterministically** with the state script —
  do NOT hand-write it:

      node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" init --name "<project>" --version "<version>" --mode existing

  The command writes `docs/requirements/sdlc-metadata.yml` and prints `{ ok, state }`.
  **Verify before proceeding:** confirm `"ok": true` and `state.mode: "resume"` with
  `"valid": true`. If `ok` is false or the write needs approval, surface it and retry — do
  NOT continue to Phase 1 until the file is confirmed written. Then proceed to Phase 1.

- **`resume`** with `valid: false`: The metadata file could not be parsed. Show the user
  the problem and offer to repair it (re-create from the template, preserving any phase
  statuses you can read) or to reinitialize. Do not crash.

- **`resume`** (valid): Announce where they are, e.g. "You're on **Develop**, at the
  **test_author** agent." Then offer choices based on `setupComplete`:
  - If `setupComplete` is true: `1) Develop a feature  2) Continue to <next phase>  3) Pick a phase`.
  - If `setupComplete` is false: offer to run the next setup phase (`phase` from the JSON).

### Step 3 — Setup gating
Develop, Verify, Release, and Operate are BLOCKED until Prepare, Define, and Design are
all `completed` (`setupComplete: true`). If the user asks for a gated phase early, explain
why and route them to the first pending setup phase instead.

### Step 4 — Run the chosen phase
Read the phase playbook at `${CLAUDE_PLUGIN_ROOT}/phases/phase-<n>-<name>.md` and follow
it: dispatch its subagents via the Task tool per the playbook's `groups:` frontmatter —
groups run top to bottom; in a `sequential` group dispatch one agent at a time in listed
order; in a `parallel` group dispatch all agents concurrently in ONE message; a
`conditional` group is dispatched only when the condition stated in the playbook body
holds (otherwise skip it). Run the validation gate after each group. Every gate agent ends
its report with one machine-parsable `VERDICT: PASS|FAIL` line (the phase's own verdict
name — APPROVED, READY FOR RELEASE, PUBLISH GATE — stays alongside): key the pass/fail
decision off that line, not the surrounding prose. If a gate report lacks a parseable
`VERDICT:` line, re-dispatch that gate agent once with the defect named; a second miss is
a gate FAIL. On a gate FAIL, follow the playbook's bolded **Gate FAIL** routing —
re-dispatch the named author(s), re-run the gate — and when the playbook's loop bound
trips, STOP and run the escalation protocol below.

#### Escalation — `HUMAN_REVIEW_REQUIRED`
Every playbook loop is bounded, and every bound ends the same way (a gate FAILing 3×, a
previously-cleared issue reappearing, an author still blocked after 3 clarifier rounds,
Verify still REWORK REQUIRED after cycle 3): STOP dispatching and present this block. Do
not keep looping, and do not mark the phase or the gate agent completed — state stays
where it is, so a later `/sdlc` run resumes at the same spot.

    HUMAN_REVIEW_REQUIRED
    Phase / gate:  <phase> — <the agent whose loop hit its bound>
    Trigger:       <which bound tripped, with the count>
    Open blockers: <each unresolved blocker, quoted from the last gate report>
    Artifacts:     <paths of the report/plan/docs the human needs to decide>
    Options:       1) guidance — give me the decision and I resume the loop
                   2) waive — accept these blockers; the gate records WAIVED, not PASS
                   3) abort — stop here; /sdlc resumes from saved state later

Then act on the user's choice:
1. **guidance** — re-dispatch the relevant author with the user's decision embedded in
   the prompt. The loop bound resets (the human changed the inputs), but the
   previously-cleared-issue rule still applies.
2. **waive** — proceed with the playbook's completion steps, reporting the gate as
   **WAIVED by the user** (with their one-line reason) in the phase summary. A waived
   gate is never reported as PASS.
3. **abort** — stop the run and report where it stopped. Nothing further is marked
   complete, so `/sdlc` resumes from the metadata.

#### Model routing (apply on every dispatch)
`modelProfile` from Step 0 selects how much model to spend per agent. Each agent belongs to
one tier; pass the tier's model alias as the Task tool's `model` parameter ("inherit" =
omit the parameter, i.e. the session model). **No profile ever downgrades the full tier** —
gates and code-writing keep the strongest model.

Agent names below are the file names minus the `sdlc-` prefix; every agent belongs to
exactly one tier (a structure test pins the roster coverage).

| Tier | Agents | quality | balanced (default) | economy |
|------|--------|---------|--------------------|---------|
| **full** — judgment & gates | `define-requirement-reviewer` `design-reviewer` `develop-code-reviewer` `verify-independent-code-reviewer` `verify-validation-reviewer` `release-reviewer` `develop-architect-planner` `develop-architect-clarifier` `develop-code-author` `develop-test-author` `develop-implementer` `operate-feedback-loop` | inherit | inherit | inherit |
| **standard** — analysis & doc authoring | `prepare-explorer` `prepare-claude-md` `define-source-analyst` `define-test-analyst` `define-nfr-analyst` `define-fr-author` `define-nfr-author` `define-us-author` `design-architecture-explorer` `design-decisions-explorer` `design-architecture-author` `design-component-spec-author` `design-adr-traceability-author` `develop-reqs-sync` `verify-coverage-analyst` `release-planner` `release-author` `operate-issue-triager` `operate-incident-responder` | inherit | sonnet | haiku |
| **fast** — mechanical tool-running | `verify-static-dynamic-analyzer` `verify-regression-tester` `operate-dependency-monitor` `operate-telemetry-monitor` | inherit | haiku | haiku |

If a dispatch fails because the alias is unavailable on the user's plan, re-dispatch that
one agent with inherit. To change the profile (persisted deterministically — never hand-edit):

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" config --model-profile <quality|balanced|economy>

If the phase playbook file does not exist yet, tell the user that phase is not available
in this build (the phase playbooks and subagents are delivered in a later plan) and stop
gracefully — do not invent agents.

### Step 5 — Update state (deterministic — never hand-edit the YAML)
After each agent or group passes its gate, mark progress with the state script — do NOT edit
`docs/requirements/sdlc-metadata.yml` by hand (that is slow and error-prone):

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" complete --phase <phase> --agent <agent>

When a phase finishes (all its agents done, or it completes as a unit), mark the whole phase:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" complete --phase <phase>

Each call rewrites the statuses deterministically and prints a terse `{ ok, phase, agent }`.
Prefer ONE `complete --phase <phase>` at the END of a phase — it marks the phase AND all its
agents; use `--agent` only to checkpoint mid-phase. Don't chain many per-agent calls at once.
Re-read the detector (Step 0) for the board / next decision.

Lifecycle data goes through the same script — never hand-edit `sdlc-metadata.yml`:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" counts --functional <n> --nonfunctional <n> --user-stories <n>
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" plan-add --id PLAN-NNN
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" cycle --assessment <stable|maintain|evolve|urgent> --next-cycle <true|false> [--scope "..."] [--reason "..."]

`counts` records the totals Define / Requirements Sync report (`REQUIREMENT_COUNTS:` line);
`plan-add` appends the plan id in Develop's post-phase; `cycle` records Operate's `CYCLE:`
verdict AND resets the next cycle's phases (maintain/urgent → develop..operate pending;
evolve → define..operate pending; stable → lifecycle complete).
