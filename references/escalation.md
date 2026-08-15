# Escalation protocol — `HUMAN_REVIEW_REQUIRED`

Read by the /sdlc wizard the moment a playbook loop bound trips. Every playbook loop is
bounded, and every bound ends the same way (a gate FAILing 3×, a previously-cleared issue
reappearing, an author still blocked after 3 clarifier rounds, Verify still REWORK REQUIRED
after cycle 3): STOP dispatching and present this block. Do not keep looping, and do not
mark the phase or the gate agent completed — state stays where it is, so a later `/sdlc`
run resumes at the same spot.

    HUMAN_REVIEW_REQUIRED
    Phase / gate:  <phase> — <the agent whose loop hit its bound>
    Trigger:       <which bound tripped, with the count>
    Open blockers: <each unresolved blocker, quoted from the last gate report>
    Artifacts:     <paths of the report/plan/docs the human needs to decide>
    Options:       1) guidance — give me the decision and I resume the loop
                   2) waive — accept these blockers; the gate records WAIVED, not PASS
                   3) abort — stop here; /sdlc resumes from saved state later

Then act on the user's choice:

1. **guidance** — re-dispatch the relevant author with the user's decision embedded in
   the prompt. The loop bound resets (the human changed the inputs) — clear the persisted
   counter with `loop-reset --phase <phase>` — but the previously-cleared-issue rule
   still applies.
2. **waive** — proceed with the playbook's completion steps, reporting the gate as
   **WAIVED by the user** (with their one-line reason) in the phase summary. Record it:
   `gate-log --phase <phase> --gate <gate-agent> --verdict WAIVED --note "<the user's
   reason>"` — the ONLY path by which WAIVED enters the log. A waived gate is never
   reported as PASS.
3. **abort** — stop the run and report where it stopped. Nothing further is marked
   complete, so `/sdlc` resumes from the metadata.
