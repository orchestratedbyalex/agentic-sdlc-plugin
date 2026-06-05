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

## What this build (Plan 1) includes
- The `/sdlc` wizard: detects `greenfield | existing | resume` and shows the phase board.
- Deterministic, tested state detection (`scripts/sdlc-state.mjs`).
- Artifact templates and the `sdlc-conventions` reference skill.

Phase execution (the 34 subagents + per-phase playbooks) ships in subsequent plans.

## Test
```bash
node --test
```

## License
PolyForm Noncommercial 1.0.0 — see LICENSE.md.
