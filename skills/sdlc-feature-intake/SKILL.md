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
4. Show the drafted US (and FR stub) to the user for edit/approval. **The user's edits win.**
5. Hand the approved `US-NNN` (and `FR-NNN`) ids to the Architect Planner as the change to plan.

## Reconciliation

The drafted US/FR are provisional (`status: proposed`). The Develop **Requirements Sync**
agent finalizes them at the end of the phase (sets `accepted`, wires the traceability
matrix, bumps `requirement_counts`) so the up-front draft and the shipped code converge.
