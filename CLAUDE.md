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
| `test/` | `node:test` suites (state logic + hook guard + plugin structure) |

## Build / test / run

```bash
node --test            # run all tests (currently 97, must stay green)
claude --plugin-dir .  # load the plugin into a Claude Code session for live use
/reload-plugins        # (inside the session, after edits)
/agentic-sdlc:sdlc     # run the wizard
```

There is no build/transpile step — agents and playbooks are markdown; the only executables are
`scripts/sdlc-state.mjs` and `scripts/sdlc-guard.mjs` (plain ESM, no dependencies).

## Design invariants — DO NOT regress these

These were established deliberately (several via live runs + multi-specialist review). Treat
them as constraints, not suggestions; the rationale is recorded in the git history.

1. **Reviewer ≠ author.** Review agents have read-only tools (`Read Grep Glob Bash`); only
   authors get `Write Edit`. Never give a reviewer write tools. Pinned by a structure test.
2. **Deterministic state.** Every `sdlc-metadata.yml` mutation goes through
   `scripts/sdlc-state.mjs` (`init` / `complete` / `config` / `brief` / `counts` /
   `plan-add` / `cycle`) — never an LLM hand-edit of YAML. Agents that produce lifecycle
   data (Requirements Sync, Feedback Loop) report it in sentinel lines
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

## When editing agents

- Agent frontmatter: `name`, `description`, `tools` (space-separated). Body = context header
  (role, phase, what to read first, "FINAL MESSAGE is your return value") + `--- TASK ---` +
  the working prompt.
- After any change, run `node --test` — `test/plugin-structure.test.mjs` asserts all 7
  playbooks exist, the **35-agent** roster count, reviewer read-only tool grants, the
  model-routing table's exact roster coverage, the gate agents' machine-parsable
  `VERDICT: PASS|FAIL` line, and the sentinel templates. Don't let those drift silently.

## Status

Feature-complete and **live-proven end-to-end** (all 7 phases run on a real external repo).
See `README.md` for install + usage, `CONTRIBUTING.md` for the contributor workflow, and
`CHANGELOG.md` for the release history.
