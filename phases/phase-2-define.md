---
phase: define
phase_number: 2
setup: "mkdir -p docs/requirements/{functional,nonfunctional,user-stories}"
groups:
  - { mode: parallel, agents: [sdlc-define-source-analyst, sdlc-define-test-analyst, sdlc-define-nfr-analyst] }
  - { mode: parallel, agents: [sdlc-define-fr-author, sdlc-define-nfr-author, sdlc-define-us-author] }
  - { mode: sequential, agents: [sdlc-define-requirement-reviewer] }
gate_after_each_group: true
post_phase: "write traceability-matrix.md + review-checklist.md; set define.status + agent statuses to completed; update requirement_counts"
---

# Phase 2 — Define

Run the setup command first. Then dispatch:

1. **Exploration (parallel):** sdlc-define-source-analyst, sdlc-define-test-analyst,
   sdlc-define-nfr-analyst — one Task message, three concurrent dispatches. Collect findings.
2. **ID allocation (orchestrator, no agent):** before dispatching the authors, derive a terse
   **REQUIREMENT ID ALLOCATION** block from the findings — one `FR-NNN ↔ <slug>: <one-line
   title>` row per major feature area (from the source-analyst) and one `NFR-NNN ↔ <slug>:
   <one-line title>` row per evidenced NFR category (from the nfr-analyst). The three authors
   run in parallel; this shared allocation is what keeps their cross-references (US
   `implements_fr`/`implements_nfr`) consistent without a serialization barrier.
3. **Authoring (parallel):** sdlc-define-fr-author, sdlc-define-nfr-author,
   sdlc-define-us-author — pass the findings AND the same allocation block to all three.
   They write FR/NFR/US docs against the allocated IDs.
   - **If any author returns UNALLOCATED or UNMAPPED items:** extend the allocation with the
     new IDs and re-dispatch only the affected author(s) with the delta (e.g. the us-author to
     fill in a now-allocated `implements_fr`) BEFORE running the reviewer — cheaper than
     burning a gate cycle on a known gap.
4. **Validation (sequential):** sdlc-define-requirement-reviewer — runs the 7-point gate.
   - **Gate FAIL:** route the reported issues back to the relevant author, re-run the author,
     then re-run the reviewer. If the gate FAILs **3** times (or a previously-cleared issue
     reappears), STOP and emit `HUMAN_REVIEW_REQUIRED` — do not keep looping.

**On completion:** write `docs/requirements/traceability-matrix.md` and
`docs/requirements/review-checklist.md`; update `requirement_counts`; set every
`define.agents.*.status` and `define.status` to `"completed"`.
