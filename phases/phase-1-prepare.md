---
phase: prepare
phase_number: 1
setup: ""
groups:
  - { mode: sequential, agents: [sdlc-prepare-explorer, sdlc-prepare-claude-md] }
gate_after_each_group: true
post_phase: "set prepare.status and both agents' status to completed in sdlc-metadata.yml"
---

# Phase 1 — Prepare

Dispatch in order (sequential; the author depends on the explorer):

1. **sdlc-prepare-explorer** — pass the user's project context. It returns codebase facts.
2. **sdlc-prepare-claude-md** — pass the explorer's findings. It writes `CLAUDE.md`.

**Gate:** confirm `CLAUDE.md` exists at the repo root and contains build/test commands +
an architecture overview. If missing, re-dispatch sdlc-prepare-claude-md.

**On completion:** update `docs/requirements/sdlc-metadata.yml` — set
`prepare.agents.explorer.status` and `prepare.agents.claude_md.status` to `"completed"`,
and `prepare.status: "completed"`.
