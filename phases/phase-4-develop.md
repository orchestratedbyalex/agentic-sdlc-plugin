---
phase: develop
phase_number: 4
setup: "ensure docs/design/implementation-plans/ exists"
groups:
  - { mode: sequential, agents: [sdlc-develop-architect-planner] }
  - { mode: parallel, agents: [sdlc-develop-code-author, sdlc-develop-test-author] }
  - { mode: conditional, agents: [sdlc-develop-architect-clarifier] }
  - { mode: sequential, agents: [sdlc-develop-code-reviewer] }
  - { mode: sequential, agents: [sdlc-develop-reqs-sync] }
gate_after_each_group: true
post_phase: "set develop.status completed; append the PLAN-NNN entry; develop is repeatable"
---

# Phase 4 — Develop (repeatable, one change per run)

Pre-step: run the **sdlc-feature-intake** skill to turn the change request into an
approved `US-NNN` (+ optional `FR-NNN`). Pass those ids forward.

Dispatch:

1. **Architect Planner (sequential):** pass the approved US/FR. It reads accepted ADRs +
   traceability and writes `docs/design/implementation-plans/PLAN-NNN-<slug>.md`. Capture PLAN_PATH.
2. **Code + Test Author (parallel):** pass PLAN_PATH. Each scans the plan for ambiguities first.
   - **If either returns an AMBIGUITIES block:** dispatch **sdlc-develop-architect-clarifier**
     with the block; it updates the PLAN (version bump + Clarifications). Then re-dispatch the
     author(s) that were blocked. Repeat until both produce work cleanly.
3. **Code Reviewer (sequential):** reviews all changes vs the PLAN + ADRs and runs the full
   test suite.
   - **CHANGES REQUESTED:** route each blocker to code-author or test-author, re-run them,
     then re-run the reviewer. Repeat until APPROVED.
4. **Requirements Sync (sequential):** for every new behavior, create FR + US, update
   `traceability-matrix.md` + `design-traceability.md`, bump `requirement_counts`. If the
   PLAN declared `proposes_new_adrs`, verify the ADR was written.

**On completion:** set `develop.status: "completed"`, append the `PLAN-NNN` id under
`develop.plans`. Develop is repeatable — a later feature starts a fresh run at the planner.
