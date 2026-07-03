# CLAUDE.md

Guidance for Claude Code (and any reviewer model) working in **this** repository — the
**Agentic SDLC** Claude Code plugin. If you are here to extend the plugin, read this first,
then `CONTRIBUTING.md`.

## What this repository is

A **Claude Code plugin** that runs a standards-anchored, agent-driven Software Development
Lifecycle. One command — `/agentic-sdlc:sdlc` (short `/sdlc`) — launches a wizard that detects
project state and drives **seven phases** (Prepare → Define → Design → Develop → Verify →
Release → Operate) using a roster of **35 specialized subagents**.

This is the plugin itself (the "how"). It is applied *to* a target repository, which receives
the "evidence" (requirements, design docs, `sdlc-metadata.yml`). That separation is the
**two-zone model** and is load-bearing: the plugin carries the process; the target repo
accumulates the evidence.

## Layout

| Path | What |
|------|------|
| `.claude-plugin/` | Plugin manifest + marketplace entry |
| `commands/sdlc.md` | The `/sdlc` wizard (orchestrator entry point) |
| `agents/` | The 35 subagents (one `.md` each), grouped by phase: `sdlc-<phase>-<role>.md` |
| `phases/` | 7 machine-readable phase playbooks (groups, modes, gates, post_phase) |
| `skills/` | `sdlc-conventions` (read hygiene, shared rules) + `sdlc-feature-intake` (change tiering) |
| `templates/` | Artifact templates (FR, NFR, US, PLAN, ADR, CS, metadata) |
| `hooks/hooks.json` | PreToolUse wiring: Bash + file-mutation calls run the guard script |
| `scripts/` | **The only real code** (zero-dep Node ESM): `sdlc-state.mjs` owns ALL metadata state; `sdlc-guard.mjs` enforces invariants 2 + 4 as a hook |
| `test/` | `node:test` suites (state logic + hook guard + eval-harness lib + plugin structure) |
| `evals/` | Agent evals: labelled golden fixtures + a **billed, opt-in** headless runner — never part of `node --test` (see `evals/README.md`) |

## Build / test / run

```bash
node --test                      # run all tests (currently 159, must stay green; model-free)
node evals/run.mjs --list        # list the agent evals (free)
SDLC_EVALS=1 node evals/run.mjs  # run the agent evals headless — BILLED (real model calls)
claude --plugin-dir .            # load the plugin into a Claude Code session for live use
/reload-plugins                  # (inside the session, after edits)
/agentic-sdlc:sdlc               # run the wizard
```

There is no build/transpile step — agents and playbooks are markdown; the only executables are
`scripts/sdlc-state.mjs`, `scripts/sdlc-guard.mjs`, and the eval harness under `evals/` (all
plain ESM, no dependencies).

## Design invariants — DO NOT regress these

These were established deliberately (several via live runs + multi-specialist review). Treat
them as constraints, not suggestions; the rationale is recorded in the git history.

1. **Reviewer ≠ author.** Review agents have read-only tools (`Read Grep Glob Bash`); only
   authors get `Write Edit`. Never give a reviewer write tools. Pinned by a structure test.
2. **Deterministic state.** Every `sdlc-metadata.yml` mutation goes through
   `scripts/sdlc-state.mjs` (`init` / `complete` / `config` / `brief` / `counts` /
   `plan-add` / `cycle` / `gate-log` / `plan-active` / `clarifier-round` / `loop-reset` /
   `reopen`) — never an LLM hand-edit of YAML. That includes the **persisted loop state**
   (the script-owned `runtime:` block: gate strike counters, clarifier rounds, the active
   plan, the gate-verdict log), so the 3-strike bounds and the Verify cycle survive
   interruption instead of living in conversation memory — and the **route-back
   transitions**: a later gate's REWORK reopens the earlier phase via `reopen` (phase →
   in_progress, only the responsible agents → pending, loop bounds untouched), so resume
   lands on the rework; `complete --phase` carries an `--evidence` attestation citing the
   gate verdict that backs it (cleared automatically on reopen). Agents that produce
   lifecycle data (Requirements Sync, Feedback Loop) report it in sentinel lines
   (`REQUIREMENT_COUNTS:` / `CYCLE:`); the orchestrator is the single writer. Enforced
   deterministically by a PreToolUse hook: `scripts/sdlc-guard.mjs` **denies** direct
   Edit/Write of the YAML (and the obvious Bash writes into it), pointing at the script.
3. **Exercise the real artifact, not a proxy.** Gates must run the *actual* production build
   and confirm tests truly executed (0 suites collected = FAIL), not just "types pass / no
   failing assertions." (Verify + Release + Develop reviewer.) Gate reports quote **verbatim
   execution evidence** (exact command, exit code, the runner's own summary lines), and the
   Verify release gate independently re-runs the test suite once (condition d2) rather than
   trusting self-reported counts.
4. **Git stays human-gated.** Agents **stage + suggest** commits/tags; they do not commit,
   tag, push, or publish. (Develop + Release.) Enforced deterministically by the same hook:
   `git commit`/`tag`/`push`, `gh release`, `npm publish` become an explicit permission
   **ask** — deliberately ask, never deny, because the human approving the prompt IS the
   gate. Hooks fire session-wide in the repo where the plugin is enabled.
5. **Don't yak-shave the target.** If a target repo's *pre-existing* toolchain is broken,
   that's a gate finding to route back — agents must NOT rewrite the target's dependency tree,
   add `resolutions`, monkey-patch `node_modules`, or add `postinstall` patches.
6. **Proportionate ceremony.** Feature-intake classifies a change trivial/standard/complex
   (with hard floors: security / public-interface / dependency can't be trivial); depth scales,
   but reviewer≠author, tests, diff-awareness, traceability, and security checks hold at every tier.
7. **Standards-anchored.** Each phase cites its source standard (ISO/IEC/IEEE 12207, IEEE
   1012/1016, Microsoft SDL, ITIL 4, ISO 25010/27001, Nygard ADRs). Keep the citations honest.
8. **Subagents return only their final message.** They run in isolated contexts; their final
   message IS the return value to the orchestrator. Keep orchestrator output terse.
9. **Model profiles never downgrade the gates.** Model routing (`quality`/`balanced`/`economy`,
   see `commands/sdlc.md`) may run mechanical/analysis agents on smaller models, but full-tier
   agents (every reviewer/validator, the planner, the clarifier, the code/test/implementer
   authors, the feedback-loop) always inherit the session model — in every profile.
10. **The lifecycle pauses for humans at exactly three altitudes.** `HUMAN_CHECKPOINT`
    (distinct from the `HUMAN_REVIEW_REQUIRED` failure escalation) is a planned sign-off on
    gate-PASSed work: the Define requirements sign-off, the Design sign-off — where ADR
    trade-offs are decided: new-decision ADRs enter `proposed` and only the human's approval
    flips them to `accepted` — and the Operate cycle go/no-go (the feedback loop proposes
    via `CYCLE:`, the human disposes before `cycle` records; a new cycle never self-starts).
    The sign-off enters the phase's `--evidence` attestation. Exactly three — don't add more
    (see invariant 6) and don't remove one.

## When editing agents

- Agent frontmatter: `name`, `description`, `tools` (space-separated). Body = context header
  (role, phase, what to read first, "FINAL MESSAGE is your return value") + `--- TASK ---` +
  the working prompt.
- After any change, run `node --test` — `test/plugin-structure.test.mjs` asserts all 7
  playbooks exist, the **35-agent** roster count, reviewer read-only tool grants, the
  model-routing table's exact roster coverage, the gate agents' machine-parsable
  `VERDICT: PASS|FAIL` line, the sentinel templates, the persisted-loop-state wiring
  (`gate-log` / `loop-reset` / `runtime` in the orchestrator; `plan-active` /
  `clarifier-round` / `verifyCycle` in playbooks 4–5), the route-back recovery wiring
  (`reopen` + `--evidence` in the orchestrator; `reopen --phase develop` /
  `reopen --phase verify` in playbooks 5–6), and the human-checkpoint wiring
  (`HUMAN_CHECKPOINT` + the exactly-three rule + both outcome sets in the orchestrator; the
  checkpoint in playbooks 2/3/7; `proposed`-ADR handling in the ADR author and design
  reviewer), the Release/Operate depth wiring (the planner's human-executed rollback plan +
  the release gate's `CHECK 8 — ROLLBACK READINESS`; the telemetry monitor's
  `HEALTHY | DEGRADED | UNKNOWN` post-release verdict; the feedback loop's maintenance
  pathway + CLAUDE.md rule accretion under `## Lessons learned (SDLC Operate)`), and the
  eval-harness wiring (the `SDLC_EVALS` opt-in gate in the runner; every
  case naming a real agent and a complete fixture — including any `docs/…` path the case's
  dispatch prompt references; nothing under `evals/` that `node --test`
  discovery would execute — fixture suites are `spec/*.check.mjs`, never `*.test.mjs` or a
  `test/` dir). Don't let those drift silently.
- If you change a **gate agent's prompt**, also run its eval cases (billed, opt-in:
  `SDLC_EVALS=1 node evals/run.mjs --case <id>`) — the structure tests prove the wiring,
  only the evals prove the agent still catches what it exists to catch.

## Status

Feature-complete and **live-proven end-to-end** (all 7 phases run on a real external repo),
with the gate agents additionally **eval-tested headless on labelled fixtures** (`evals/`).
See `README.md` for install + usage, `CONTRIBUTING.md` for the contributor workflow, and
`CHANGELOG.md` for the release history.
