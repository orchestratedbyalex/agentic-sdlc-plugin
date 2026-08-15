---
description: Agentic SDLC wizard — detect project state and drive the seven-phase lifecycle (Prepare to Operate).
argument-hint: "[optional: phase name or change request]"
---

# Agentic SDLC Wizard

## Step 0 — Detect project state

Your FIRST action: run the state detector with the Bash tool and read its JSON output. It
prints `{ mode, board, phase, agent, setupComplete, valid, modelProfile, runtime,
verifyCycle }` for the current working directory:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs"
```

`${CLAUDE_PLUGIN_ROOT}` is this plugin's install directory; if your shell does not have it
set, substitute the absolute path of the folder that contains `scripts/sdlc-state.mjs`.

## Your job

You are the SDLC orchestrator. The JSON from Step 0 tells you the `mode`, the phase
`board`, the resume `phase`, the resume `agent`, and `setupComplete`. Use it — do not
re-derive state by hand. `runtime` is the persisted loop state (gate strike counts,
clarifier rounds, the active plan, the gate-verdict log) and `verifyCycle` is the Verify
cycle the next run enters — on resume, continue from those bounds; never assume they are
zero because the conversation is fresh.

Deeper protocol detail lives in `${CLAUDE_PLUGIN_ROOT}/references/` — read a reference
ONLY at the trigger named below, not up front; that lazy loading is the plugin's context
budget.

User argument (may be empty): `$ARGUMENTS`

### Step 1 — Print the status board
Render the seven phases with the board statuses: `✓` completed, `→` the first
non-completed phase (next), `·` pending. Show `project` and `version` if present.

Also surface the active model profile from Step 0's `modelProfile` as one line, so the
cost lever is discoverable — it tunes only the non-gate agents:

    ⚙ Model profile: <modelProfile> — tunes non-gate agents only (gates & code authors stay full-tier). Ask me to switch to `quality` or `economy`.

Render `<modelProfile>` as the detected value; on resume this shows whatever was chosen.

### Step 2 — Route on `mode`

- **`greenfield`** (empty folder) or **`existing`** (code, no metadata): read
  `${CLAUDE_PLUGIN_ROOT}/references/setup.md` NOW and follow the matching branch exactly.
  It covers the brief and `init` (deterministic, via the state script — verify the write
  landed before proceeding), the greenfield skeleton scaffold, and the one-time
  model-profile pick. Then proceed to Phase 1.

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
holds (otherwise skip it). Run the validation gate after each group.

**Model routing:** before the FIRST dispatch of the run, read
`${CLAUDE_PLUGIN_ROOT}/references/model-routing.md` and apply its tier table (agent →
tier, tier × `modelProfile` → the Task tool's `model` parameter) on every dispatch. No
profile ever downgrades the full tier — gates and code authors stay on the session model.

**Gate parsing:** every gate agent ends its report with one machine-parsable
`VERDICT: PASS|FAIL` line (the phase's own verdict name — APPROVED, READY FOR RELEASE,
PUBLISH GATE — stays alongside): key the pass/fail decision off that line, not the
surrounding prose. If a gate report lacks a parseable `VERDICT:` line, re-dispatch that
gate agent once with the defect named; a second miss is a gate FAIL. Record every gate
verdict deterministically the moment you parse it:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" gate-log --phase <phase> --gate <gate-agent> --verdict PASS|FAIL|WAIVED [--note "<one line>"]

The script owns the strike counter — FAIL increments it, PASS/WAIVED resets it — and
prints `strikes`: trip the playbook's 3-strike bound off that number, never off
conversation memory (it survives interruption; Step 0's `runtime` restores it on resume).
On a gate FAIL, follow the playbook's bolded **Gate FAIL** routing — re-dispatch the named
author(s), re-run the gate — and when the playbook's loop bound trips, STOP and escalate:

- **Escalation — `HUMAN_REVIEW_REQUIRED`:** every playbook loop is bounded (a gate
  FAILing 3×, a previously-cleared issue reappearing, an author still blocked after 3
  clarifier rounds, Verify still REWORK REQUIRED after cycle 3). The moment a bound
  trips: STOP dispatching, leave state where it is, read
  `${CLAUDE_PLUGIN_ROOT}/references/escalation.md`, present its block, and act on the
  user's choice (guidance / waive / abort) exactly as it specifies.

- **Sign-off checkpoints — `HUMAN_CHECKPOINT`:** a checkpoint is NOT an escalation — it
  is a planned human sign-off on gate-PASSed work. Exactly three exist (Define
  requirements sign-off; Design & ADR sign-off; Operate cycle go/no-go) — never add one
  and never skip one because the gate looked clean. When a playbook reaches a checkpoint,
  read `${CLAUDE_PLUGIN_ROOT}/references/checkpoints.md`, present its block, and act on
  the outcome (approve / adjust / abort, or go / defer / override) exactly as it
  specifies.

If the phase playbook file does not exist yet, tell the user that phase is not available
in this build (the phase playbooks and subagents are delivered in a later plan) and stop
gracefully — do not invent agents.

### Step 5 — Update state (deterministic — never hand-edit the YAML)
After each agent or group passes its gate, mark progress with the state script — do NOT edit
`docs/requirements/sdlc-metadata.yml` by hand (that is slow and error-prone):

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" complete --phase <phase> --agent <agent>

When a phase finishes (all its agents done, or it completes as a unit), mark the whole
phase — and **attest it**: pass `--evidence` citing the proof that backs the completion
(the gate verdict you just recorded via `gate-log`, or the artifact path that shows the
work landed). A phase completed without evidence is a claim:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" complete --phase <phase> --evidence "<gate> VERDICT: PASS <date>"

Each call rewrites the statuses deterministically and prints a terse `{ ok, phase, agent }`.
**Checkpoint as you go**: run `complete --agent` for each agent as its work lands (at
minimum after every gate-passing group) — an interruption resumes at the last checkpoint,
and the per-agent statuses are what let a later route-back reopen precisely. The closing
`complete --phase <phase>` still marks the phase AND any remaining agents; the attestation
lands under the phase and is cleared automatically if the phase is later reopened.
Re-read the detector (Step 0) for the board / next decision.

Lifecycle data goes through the same script — never hand-edit `sdlc-metadata.yml`:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" counts --functional <n> --nonfunctional <n> --user-stories <n>
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" plan-add --id PLAN-NNN
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" cycle --assessment <stable|maintain|evolve|urgent> --next-cycle <true|false> [--scope "..."] [--reason "..."]

`counts` records the totals Define / Requirements Sync report (`REQUIREMENT_COUNTS:` line);
`plan-add` appends the plan id in Develop's post-phase; `cycle` records Operate's `CYCLE:`
verdict AND resets the next cycle's phases (maintain/urgent → develop..operate pending;
evolve → define..operate pending; stable → lifecycle complete).

So does the loop state (the `runtime` block is script-owned):

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" gate-log --phase <p> --gate <g> --verdict PASS|FAIL|WAIVED [--note "..."]
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" plan-active --id PLAN-NNN
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" clarifier-round --author <author>
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" loop-reset --phase <p>

`gate-log` records each parsed `VERDICT:` and reports the phase's strike count (Step 4);
`plan-active` points at the plan the current Develop run follows (re-point on SUPERSEDED);
`clarifier-round` counts a clarifier dispatch against the blocked author; `loop-reset` is
the escalation guidance outcome. All of it lands in the metadata, so bounds survive
interruption.

Route-backs are state transitions too — never leave them in conversation memory. When a
later gate routes work back to an earlier, already-completed phase (Verify's REWORK
REQUIRED → Develop; a Release-discovered Verify miss → Verify), reopen that phase
deterministically after recording the FAIL via `gate-log`:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-state.mjs" reopen --phase <phase> --agent <responsible> [--agent <responsible>]

The phase returns to `in_progress` and ONLY the named agents drop to `pending` — completed
siblings keep their status, the loop counters and gate log survive (the verify strike count
carries the re-verify cycle across the rework), and the phase's `evidence` attestation is
cleared. A resumed session then lands on the rework, not on the phase that routed back.
