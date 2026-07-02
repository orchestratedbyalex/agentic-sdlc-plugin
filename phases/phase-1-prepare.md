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

> **Greenfield note:** for `mode: greenfield`, the `/sdlc` wizard scaffolds a minimal
> project skeleton (manifest, config, `src/`, `test/`, README) from the brief *before*
> this phase runs, so the read-only explorer has real structure to analyze. For
> `mode: existing` the repo already has code and this phase runs directly.

Dispatch in order (sequential; the author depends on the explorer):

1. **sdlc-prepare-explorer** — pass the user's project context. It returns codebase facts.
2. **sdlc-prepare-claude-md** — pass the explorer's findings. It writes `CLAUDE.md`.

**Gate:** confirm `CLAUDE.md` exists at the repo root and contains build/test commands +
an architecture overview.

- **Gate FAIL:** re-dispatch sdlc-prepare-claude-md with the missing pieces named. If the
  gate FAILs **3** times, STOP and emit `HUMAN_REVIEW_REQUIRED` — do not keep looping.

**On completion:** update `docs/requirements/sdlc-metadata.yml` — set
`prepare.agents.explorer.status` and `prepare.agents.claude_md.status` to `"completed"`,
and `prepare.status: "completed"`.
