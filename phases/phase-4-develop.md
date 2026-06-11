---
phase: develop
phase_number: 4
setup: "ensure docs/design/implementation-plans/ exists"
groups:
  - { mode: sequential, agents: [sdlc-develop-architect-planner] }
  - { mode: parallel, tier: standard_complex, agents: [sdlc-develop-code-author, sdlc-develop-test-author] }
  - { mode: sequential, tier: trivial, agents: [sdlc-develop-implementer] }
  - { mode: conditional, agents: [sdlc-develop-architect-clarifier] }
  - { mode: sequential, agents: [sdlc-develop-code-reviewer] }
  - { mode: sequential, agents: [sdlc-develop-reqs-sync] }
  - { mode: sequential, agents: [sdlc-develop-code-reviewer] }
gate_after_each_group: true
post_phase: "stage the change + suggest a commit message (do NOT commit/push); append the PLAN-NNN id to develop.plans; set develop.status completed; develop is repeatable"
---

# Phase 4 — Develop (repeatable, one change per run)

Pre-step: run the **sdlc-feature-intake** skill to turn the change request into an approved
`US-NNN` (+ optional `FR-NNN`) AND a confirmed change **TIER** (🟢 trivial / 🟡 standard /
🔴 complex; the skill applies the security/breaking/dependency floors). Pass the ids + TIER
forward. The tier scales ceremony **depth** only — reviewer ≠ author, tests, diff-awareness,
traceability, and the security check are kept at every tier. Record the tier in the PLAN's
`tier:` field.

Dispatch (steps marked ⊘ are skipped for 🟢 trivial):

1. **Architect Planner (sequential):** pass the approved US/FR **and TIER**. It writes
   `docs/design/implementation-plans/PLAN-NNN-<slug>.md` and captures PLAN_PATH.
   - 🟢 **trivial:** lite plan — target file(s) + the ACs to satisfy + the Security-Impact
     line; read only an ADR/CS the change clearly touches (skip the full sweep).
   - 🟡/🔴 **standard/complex:** the full plan (complex MUST assess ADR impact and, if the
     change touches a trust boundary, the Trust Boundaries & Threats table in
     architecture-overview.md — flag any new/changed boundary in the plan's Security-Impact).
2. **Authors (tier selects the group — exactly ONE of the two runs):** pass PLAN_PATH; each
   author scans the plan for ambiguities first.
   - 🟢 **trivial:** dispatch **sdlc-develop-implementer** alone — it writes the code AND its
     tests in one pass (the parallel split exists for throughput on bigger changes, not for
     independence — both halves are authors). Because code and tests land together, the suite
     MUST end green; there is no expected-red state. Reviewer ≠ author still holds: the Code
     Reviewer gates the result.
   - 🟡/🔴 **standard/complex:** dispatch **Code Author + Test Author in parallel.** The Test
     Author writes from the spec while the Code Author writes the code, so new tests are
     expected to fail red until the code lands — a final green suite is the **Code Reviewer's**
     gate, not the Test Author's.
   - **If any author returns an AMBIGUITIES block:** dispatch **sdlc-develop-architect-clarifier**
     with the block; it updates the PLAN (version bump + Clarifications). Then re-dispatch the
     blocked author(s). If the same author still reports AMBIGUITIES after **3** clarifier
     rounds, STOP and emit `HUMAN_REVIEW_REQUIRED` to the user.
   - **If the clarifier reports `SUPERSEDED: PLAN-NNN → PLAN-MMM`:** switch PLAN_PATH to the new
     plan for ALL remaining agents this run (authors, reviewer, reqs-sync).
3. **Code Reviewer (sequential):** pass the **TIER**. Always establishes the real diff
   (`git diff`), confirms the plan's ACs are implemented + tested, runs the test suite + lint,
   and applies the SECURITY check; an unresolved SECURITY blocker can never reach APPROVED.
   - 🟢 **trivial:** focused review — the load-bearing checks above only; skip the deep
     CS-conformance / performance-NFR / backward-compat passes that don't apply to a localized fix.
   - 🟡/🔴 **standard/complex:** the full 10-point checklist.
   - **CHANGES REQUESTED:** route each blocker to code-author or test-author, re-run them, then
     re-run the reviewer. If the reviewer issues CHANGES REQUESTED **3** times (or re-introduces
     blockers it previously cleared), STOP and escalate to the user.
4. **Requirements Sync (sequential):** reconcile the feature-intake drafts (promote
   `proposed`→`accepted`, no duplicates), create FR + US only for genuinely-new behavior, update
   `traceability-matrix.md` + `design-traceability.md`, bump `requirement_counts`, complete the
   ADR supersede + deferred-security follow-through, and run its self-check.
5. **New-requirements review (sequential, lightweight):** ⊘ skipped for 🟢 trivial (no new
   requirements). Otherwise re-dispatch **sdlc-develop-code-reviewer** over ONLY the new/promoted
   FR/US + traceability rows (reviewer ≠ author still holds) to confirm their acceptance criteria
   match the shipped behavior before completion.

**On completion:** **stage** the change (`git add` the touched files) and **suggest a commit
message** to the user — do NOT commit or push (git stays human-gated). Then append the
`PLAN-NNN` id under `develop.plans` and set `develop.status: "completed"`. Develop is repeatable
— a later feature starts a fresh run at the planner.
