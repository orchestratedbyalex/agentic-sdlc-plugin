# CLAUDE.md

Guidance for Claude Code (and any reviewer model) working in **this** repository — the
**Agentic SDLC** Claude Code plugin. If you are here to evaluate or extend the plugin, read
this first, then `REVIEW-BRIEF.md`.

## What this repository is

A **Claude Code plugin** that runs a standards-anchored, agent-driven Software Development
Lifecycle. One command — `/agentic-sdlc:sdlc` (short `/sdlc`) — launches a wizard that detects
project state and drives **seven phases** (Prepare → Define → Design → Develop → Verify →
Release → Operate) using a roster of **34 specialized subagents**.

This is the plugin itself (the "how"). It is applied *to* a target repository, which receives
the "evidence" (requirements, design docs, `sdlc-metadata.yml`). That separation is the
**two-zone model** and is load-bearing — see `REVIEW-BRIEF.md`.

## Layout

| Path | What |
|------|------|
| `.claude-plugin/` | Plugin manifest + marketplace entry |
| `commands/sdlc.md` | The `/sdlc` wizard (orchestrator entry point) |
| `agents/` | The 34 subagents (one `.md` each), grouped by phase: `sdlc-<phase>-<role>.md` |
| `phases/` | 7 machine-readable phase playbooks (groups, modes, gates, post_phase) |
| `skills/` | `sdlc-conventions` (read hygiene, shared rules) + `sdlc-feature-intake` (change tiering) |
| `templates/` | Artifact templates (FR, NFR, US, PLAN, ADR, CS, metadata) |
| `scripts/sdlc-state.mjs` | **The only real code.** Zero-dep Node ESM that owns ALL metadata state |
| `test/` | `node:test` suites (state logic + plugin structure) |
| `docs/` | Design spec, build plans, hardening docs, project history (co-located for review) |

## Build / test / run

```bash
node --test            # run all tests (currently 26, must stay green)
claude --plugin-dir .  # load the plugin into a Claude Code session for live use
/reload-plugins        # (inside the session, after edits)
/agentic-sdlc:sdlc     # run the wizard
```

There is no build/transpile step — agents and playbooks are markdown; the only executable is
`scripts/sdlc-state.mjs` (plain ESM, no dependencies).

## Design invariants — DO NOT regress these

These were established deliberately (several via live runs + multi-specialist review). Treat
them as constraints, not suggestions. Rationale lives in `docs/hardening-*.md`.

1. **Reviewer ≠ author.** Review agents have read-only tools (`Read Grep Glob Bash`); only
   authors get `Write Edit`. Never give a reviewer write tools.
2. **Deterministic state.** Every `sdlc-metadata.yml` mutation goes through
   `scripts/sdlc-state.mjs` (`init` / `complete`) — never an LLM hand-edit of YAML.
3. **Exercise the real artifact, not a proxy.** Gates must run the *actual* production build
   and confirm tests truly executed (0 suites collected = FAIL), not just "types pass / no
   failing assertions." (Verify + Release + Develop reviewer.)
4. **Git stays human-gated.** Agents **stage + suggest** commits/tags; they do not commit,
   tag, push, or publish. (Develop + Release.)
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

## When editing agents

- Agent frontmatter: `name`, `description`, `tools` (space-separated). Body = context header
  (role, phase, what to read first, "FINAL MESSAGE is your return value") + `--- TASK ---` +
  the working prompt.
- After any change, run `node --test` — `test/plugin-structure.test.mjs` asserts all 7
  playbooks exist and the **34-agent** roster count. Don't let that drift silently.

## Status

Feature-complete and **live-proven end-to-end** (all 7 phases run on a real external repo).
`git main`, **no remote** (intentionally local). See `REVIEW-BRIEF.md` for what to evaluate and
`docs/project-history.md` for how it got here.
