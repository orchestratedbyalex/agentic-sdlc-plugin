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
  - { mode: sequential, agents: [sdlc-develop-code-reviewer] }
gate_after_each_group: true
post_phase: "stage the change + suggest a commit message (do NOT commit/push); append the PLAN-NNN id to develop.plans; set develop.status completed; develop is repeatable"
---

# Phase 4 — Develop (repeatable, one change per run)

Pre-step: run the **sdlc-feature-intake** skill to turn the change request into an
approved `US-NNN` (+ optional `FR-NNN`). Pass those ids forward.

Dispatch:

1. **Architect Planner (sequential):** pass the approved US/FR. It reads accepted ADRs +
   traceability and writes `docs/design/implementation-plans/PLAN-NNN-<slug>.md`. Capture PLAN_PATH.
2. **Code + Test Author (parallel):** pass PLAN_PATH. Each scans the plan for ambiguities first.
   The Test Author writes from the spec while the Code Author writes the code, so new tests are
   expected to fail red until the code lands — a final green suite is the **Code Reviewer's**
   gate, not the Test Author's.
   - **If either returns an AMBIGUITIES block:** dispatch **sdlc-develop-architect-clarifier**
     with the block; it updates the PLAN (version bump + Clarifications). Then re-dispatch the
     blocked author(s). If the same author still reports AMBIGUITIES after **3** clarifier
     rounds, STOP and emit `HUMAN_REVIEW_REQUIRED` to the user.
   - **If the clarifier reports `SUPERSEDED: PLAN-NNN → PLAN-MMM`:** switch PLAN_PATH to the new
     plan for ALL remaining agents this run (authors, reviewer, reqs-sync).
3. **Code Reviewer (sequential):** establishes the real diff (`git diff`), reviews all changes
   vs the PLAN + ADRs + the plan's Security Considerations, and runs the full test suite + lint.
   A change with an unresolved SECURITY blocker cannot reach APPROVED.
   - **CHANGES REQUESTED:** route each blocker to code-author or test-author, re-run them, then
     re-run the reviewer. If the reviewer issues CHANGES REQUESTED **3** times (or re-introduces
     blockers it previously cleared), STOP and escalate to the user.
4. **Requirements Sync (sequential):** reconcile the feature-intake drafts (promote
   `proposed`→`accepted`, no duplicates), create FR + US only for genuinely-new behavior, update
   `traceability-matrix.md` + `design-traceability.md`, bump `requirement_counts`, complete the
   ADR supersede + deferred-security follow-through, and run its self-check.
5. **New-requirements review (sequential, lightweight):** re-dispatch **sdlc-develop-code-reviewer**
   over ONLY the new/promoted FR/US + traceability rows (reviewer ≠ author still holds) to confirm
   their acceptance criteria match the shipped behavior before completion.

**On completion:** **stage** the change (`git add` the touched files) and **suggest a commit
message** to the user — do NOT commit or push (git stays human-gated). Then append the
`PLAN-NNN` id under `develop.plans` and set `develop.status: "completed"`. Develop is repeatable
— a later feature starts a fresh run at the planner.
