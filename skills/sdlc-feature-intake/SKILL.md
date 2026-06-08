---
name: sdlc-feature-intake
description: Turn a plain-language change request into a drafted User Story + acceptance criteria + focus-track tag before Develop plans or codes. Use at the top of the Develop phase.
---

# Feature Intake

Run this at the start of the Develop phase, before the Architect Planner. Goal: convert
the user's plain-language request into a proper, reviewable User Story so the architect
plans against criteria, not a vague sentence.

## Steps

1. Read the user's change request (the `$ARGUMENTS` passed to /sdlc, or ask for it).
2. Ask up to three short questions, one at a time — skip any the request already answers:
   - **Who is this for?** → the User Story actor ("As a <role>…").
   - **What does "done" look like?** → the acceptance criteria (observable behavior).
   - **Primary concern?** Quality / Security / Eco / AI → the `focus_track` tag.
3. Draft a User Story using `${CLAUDE_PLUGIN_ROOT}/templates/US.md`:
   - Next `US-NNN` id (read existing `docs/requirements/user-stories/` for the highest).
   - Fill actor / capability / value and the acceptance criteria.
   - If the behavior is genuinely new functional surface, also stub an `FR-NNN` from
     `templates/FR.md` and set the US `implements_fr`.
   - Tag `focus_track` when a concern dominates.
4. **Classify the change tier** (proportionate ceremony — you propose, the human confirms):
   - **🟢 trivial** — localized, low-risk: one function/file, no new public surface, no
     consequential new behavior (e.g. a null-guard, a typo, a small bug fix).
   - **🟡 standard** — a normal feature/fix with new behavior and/or a new FR/US.
   - **🔴 complex** — architectural / cross-cutting / breaking, or needs a new ADR.

   Apply these HARD FLOORS first — they cannot be trivial no matter how small the diff:
   - touches secrets/credentials, auth, or untrusted input (security-relevant) → at least standard
   - changes a public interface, or proposes/supersedes an ADR → complex
   - adds/changes a dependency, schema, or migration → at least standard

   Propose the tier with a one-line rationale.
5. Show the drafted US (+ FR stub) AND the proposed tier to the user for edit/approval.
   **The user's edits and tier choice win** — subject to the hard floors (never go below them).
6. Hand the approved `US-NNN` (and `FR-NNN`) ids **and the confirmed TIER** to the Architect
   Planner as the change to plan.

## Reconciliation

The drafted US/FR are provisional (`status: proposed`). The Develop **Requirements Sync**
agent finalizes them at the end of the phase (sets `accepted`, wires the traceability
matrix, bumps `requirement_counts`) so the up-front draft and the shipped code converge.
