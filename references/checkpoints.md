# Sign-off checkpoints — `HUMAN_CHECKPOINT`

Read by the /sdlc wizard when a playbook reaches a human sign-off. A checkpoint is NOT an
escalation: escalation fires when a failure bound trips; a checkpoint is a planned human
sign-off on work whose gate has already PASSed, before the lifecycle commits to what
follows. **Exactly three checkpoints exist** — do not add more (proportionate ceremony)
and do not skip one because the gate looked clean:

1. **Define sign-off** — before completing Define: the human approves the requirements
   direction (totals + the key FRs/NFRs/stories).
2. **Design sign-off** — before completing Design: the human approves the architecture
   AND decides the ADR trade-offs (each `proposed` ADR's decision, its alternative, and
   the cost being accepted). Approval is what turns `proposed` ADRs into `accepted`.
3. **Operate cycle go/no-go** — before recording `cycle`, whenever the feedback loop's
   `CYCLE:` line proposes a next cycle. The feedback loop proposes; the human disposes —
   a new cycle NEVER starts on an agent's say-so alone. (A STABLE assessment proposes no
   cycle: record it directly, no checkpoint.)

Present the block and wait:

    HUMAN_CHECKPOINT
    Phase:     <define — requirements sign-off | design — design & ADR sign-off | operate — cycle go/no-go>
    Summary:   <the direction being signed off: requirement totals + key items /
                architecture choice + each proposed ADR's decision, alternative, accepted cost /
                the CYCLE assessment + scope + reason>
    Artifacts: <paths the human should read to decide>
    Options:   <the outcomes below for this checkpoint's kind>

For the two **sign-offs** (Define, Design):

1. **approve** — complete the phase, attesting both proofs:
   `complete --phase <phase> --evidence "<gate> VERDICT: PASS <date>; user sign-off <date>"`.
   For Design, first flip each approved ADR from `proposed` to `accepted` (frontmatter
   `status:`, the `## Status` section, and its `adrs/README.md` row — a mechanical edit
   the orchestrator makes directly).
2. **adjust** — route the human's direction to the responsible author(s), re-run the
   gate, and present the checkpoint again. This is not a gate FAIL — record the re-run's
   verdict via `gate-log` as usual (a PASS resets strikes anyway).
3. **abort** — stop; the phase stays incomplete. On resume, a phase whose latest gate
   verdict in `gate_log` is PASS but whose status is not `completed` is waiting at its
   checkpoint — re-present it, do not re-run the phase.

For the **go/no-go** (Operate):

1. **go** — record the cycle exactly as assessed (`cycle --assessment <a> --next-cycle
   true ...`) and begin the new cycle now.
2. **defer** — record the cycle as assessed but do NOT dispatch the next cycle; report
   that `/sdlc` will resume at the first pending phase when the user is ready.
3. **override** — the human replaces the assessment: record `cycle` with THEIR
   assessment and `--reason "user override: <their reason>"` (overriding to `stable`
   means no new cycle at all).
