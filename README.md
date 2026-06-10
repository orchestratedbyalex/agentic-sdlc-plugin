# Agentic SDLC — Claude Code Plugin

A standards-anchored, agent-driven Software Development Lifecycle for Claude Code.
Run one command — `/agentic-sdlc:sdlc` (short: `/sdlc`) — and the wizard detects your
project state and drives seven phases (Prepare → Define → Design → Develop → Verify →
Release → Operate) with a roster of specialized subagents.

## Install (local development)

```bash
claude --plugin-dir /ABSOLUTE/PATH/TO/agentic-sdlc-plugin
# inside Claude Code:
/reload-plugins
/agentic-sdlc:sdlc
```

## What's inside

- The `/sdlc` wizard: detects `greenfield | existing | resume` and drives the phase board.
- **34 specialized subagents** across the 7 phases, dispatched via the Task tool (honoring
  parallelism and the reviewer≠author rule).
- **7 machine-readable phase playbooks** (`phases/`) defining groups, modes, gates, and
  post-phase state transitions.
- **Deterministic, tested state** (`scripts/sdlc-state.mjs`) — the single source of metadata
  truth; no LLM hand-editing of state.
- Artifact templates (`templates/`) and two skills (`sdlc-conventions`, `sdlc-feature-intake`).

The plugin carries the *process*; the target repository receives the *evidence* (requirements,
design docs, `sdlc-metadata.yml`) — the **two-zone model**.

## Status

Feature-complete and **live-proven end-to-end** — all 7 phases have run on a real external
repository, with three rounds of hardening (Develop / Verify / Release). Currently local-only
(`git main`, no remote). See `CLAUDE.md`, `REVIEW-BRIEF.md`, and `docs/` for the full picture.

## Test
```bash
node --test          # currently 26 tests, all green
```

## License
PolyForm Noncommercial 1.0.0 — see LICENSE.md.
