# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Updating the plugin:** because `plugin.json` declares an explicit `version`, that field
> must be bumped for Claude Code to deliver an update to installed users — a git push alone is
> not enough. Bump the version in the same change that lands user-visible behavior.

## [Unreleased]

## [0.4.0] — 2026-07-03

### Added
- **Model profile surfaced at startup** — the `/sdlc` status board now shows the active model
  profile on every run, and first-time setup (`greenfield` / `existing`) offers a one-time pick
  (`quality` / `balanced` / `economy`), persisted deterministically via `config --model-profile`.
  Gates and code authors always stay full-tier regardless of profile (invariant 9); `resume` runs
  are never prompted.

## [0.3.0] — 2026-07-03

### Added
- **Complete deterministic write surface** for `sdlc-metadata.yml`: new state commands
  `brief`, `counts`, `plan-add`, and `cycle` (the last records the Operate assessment,
  bumps the cycle counter, and resets the next cycle's phases). This closes the four
  previously-sanctioned LLM hand-edits of the metadata — the greenfield brief,
  `requirement_counts` (Define post-phase + Requirements Sync), `develop.plans`, and the
  Operate cycle block — so design invariant 2 now holds everywhere.
- The state CLI rejects unknown subcommands instead of silently falling through to `detect`.
- **Deterministic hook enforcement of two invariants** (`hooks/hooks.json` +
  `scripts/sdlc-guard.mjs`, a zero-dependency PreToolUse guard): publish commands
  (`git commit`/`tag`/`push`, `gh release`, `npm publish`) now trigger an explicit
  permission **ask** — deliberately ask, never deny: the human approving the prompt is
  exactly the gate invariant 4 wants — and direct writes to `sdlc-metadata.yml`
  (Edit/Write/MultiEdit, shell redirects, in-place `sed`, `tee`, `cp`/`mv` onto it) are
  **denied** with a pointer at the state script, which stays the file's only writer
  (invariant 2). The guard fails open on anything it doesn't positively recognize, exempts
  read-only usage (`git tag -l`, `gh release list`, `--dry-run`) and the plugin's own
  template, and is fully unit-tested against the hook's stdin/stdout JSON protocol. Note:
  hooks fire session-wide wherever the plugin is enabled — the ask-not-deny design keeps
  that acceptable.
- **Machine-parsable gate verdicts**: every gate agent's report now ends with one
  `VERDICT: PASS|FAIL` line, and the wizard keys the gate decision off that line instead
  of interpreting prose (one re-dispatch if the line is missing; a second miss is a gate
  FAIL). Each phase's own verdict vocabulary (APPROVED / CHANGES REQUESTED, READY FOR
  RELEASE / REWORK REQUIRED, PUBLISH GATE APPROVED / BLOCKED) stays alongside for humans.
  Agents never self-issue a WAIVED verdict — a waiver only enters as a human outcome of
  the escalation protocol. The Verify coverage analyst, which previously reported gaps
  with no verdict at all, gained explicit PASS criteria.
- **Structure tests for the plugin's own contracts** (previously zero coverage of
  tiers/routing and tool grants): reviewer/validator read-only tool grants (design
  invariant 1), model-routing-table coverage of all 35 agents exactly once (the table's
  Agents column now lists explicit agent names instead of prose shorthand), the
  `VERDICT:` line in every gate agent, and the sentinel templates (`REQUIREMENT_COUNTS:`,
  `CYCLE:`, `PLAN_PATH:`) pinned at their sources.
- **Persisted loop state** (a script-owned `runtime:` block in `sdlc-metadata.yml`): gate
  strike counters, clarifier rounds, the active implementation plan, and a gate-verdict
  audit log now live in the metadata instead of the orchestrator's conversation — an
  interruption no longer resets the 3-strike bounds or the Verify cycle count. Four new
  state commands own the semantics, not the LLM: `gate-log` records each parsed `VERDICT:`
  line and reports the strike count (FAIL increments, PASS/WAIVED resets — WAIVED still
  only ever enters via the human escalation outcome), `plan-active` tracks the plan a
  Develop run follows (re-pointed on a clarifier SUPERSEDED), `clarifier-round` counts
  rounds against the blocked author, and `loop-reset` implements the escalation guidance
  outcome. The detector exposes `runtime` plus a derived `verifyCycle`, `cycle` clears the
  counters for the phases it resets (the log survives as history), and the wizard and the
  Develop/Verify playbooks key their bounds off the script's counts.
- **Route-back recovery mechanics**: when a later gate routes work back to an
  already-completed phase (Verify's REWORK REQUIRED → Develop; a Release-discovered
  Verify miss → Verify), the wizard now **reopens** that phase deterministically with a
  new `reopen --phase <p> [--agent <a>]...` state command — the phase returns to
  `in_progress` and only the named agents drop to `pending`, so completed siblings keep
  their status, the persisted loop bounds survive (the verify strike count carries the
  re-verify cycle across the rework), and a resumed session lands on the rework instead
  of the phase that sent it back. Previously no state mechanics existed for route-backs
  at all: an interruption mid-rework resumed at the wrong phase. The Verify and Release
  playbooks name the command in their routing.
- **Evidence attestation on phase completion**: `complete --phase` accepts `--evidence
  "<proof>"` recording what backed the completion (the gate verdict just logged via
  `gate-log`, or an artifact path) as a phase-level `evidence:` line — a bulk
  phase-complete with zero proof is a claim, not evidence. The attestation is cleared
  automatically when the phase is reopened. The wizard's Step 5 now also **encourages
  per-agent checkpointing** (it previously discouraged it): each agent is checkpointed as
  its work lands, so resume is precise and route-backs can reopen exactly the responsible
  agents.
- **Human checkpoints at exactly three altitudes** (`HUMAN_CHECKPOINT` — a planned sign-off
  on gate-PASSed work, deliberately distinct from the `HUMAN_REVIEW_REQUIRED` failure
  escalation): Define completes only after a human **requirements sign-off**; Design
  completes only after a **design & ADR sign-off** — decisions newly made in the design
  phase now enter as `proposed` ADRs (the agent no longer self-accepts trade-offs; the
  human's approval flips them to `accepted`, and the design gate treats pre-sign-off
  `proposed` as valid while failing a self-accepted new decision); and Operate's next cycle
  needs an explicit human **go/no-go** *before* `cycle` records — **go** starts it,
  **defer** records but waits, **override** replaces the agent's assessment with the
  human's. Previously the wizard rolled from Define/Design gate PASS straight to completion
  and from the feedback loop's `CYCLE:` line straight into a new cycle. Sign-offs land in
  the phase's `--evidence` attestation; structure tests pin the protocol, the exactly-three
  rule, and the wiring at all three altitudes.
- **An eval harness for the plugin's own agents** (`evals/` — previously the plugin had
  zero evals of its 35 agents; a live run is a demo, not an eval): golden target-repo
  fixtures with labelled outcomes are driven headless through the real plugin
  (`claude -p --plugin-dir .` dispatching the named subagent inside a throwaway copy of
  the fixture) and asserted mechanically on the gate report's machine-parsable
  `VERDICT:` line plus the verbatim-evidence contract — never an LLM judging an LLM.
  Slice 1 covers the Verify **static & dynamic analyzer** across three labels: a clean
  project must PASS (with evidence quoting the build's own output), a
  tests-green-but-build-exits-1 project must FAIL (the proxy trap behind design
  invariant 3), and a no-build-step interpreted project must PASS while saying so
  explicitly instead of inventing a build. The runner is **billed and strictly opt-in**
  (`SDLC_EVALS=1 node evals/run.mjs`) and never part of `node --test`; structure tests
  pin the opt-in gate, that every case names a real agent and a complete fixture, and
  that nothing under `evals/` can leak into `node --test` discovery (which executes any
  `*.test.mjs` anywhere and any `.mjs` under a `test/` directory — fixture suites are
  therefore `spec/*.check.mjs`). The long-dead `test/fixtures/` tree was removed, and
  the repo `.gitignore`'s `docs/` rule was scoped to the root (`/docs/`) so fixture
  metadata can be committed.
- **Eval matrix slice 2 — two more gate agents, two more failure modes** (`evals/`):
  the Develop **code reviewer** must FAIL a change that arrives as the uncommitted
  working-tree diff (via the fixture's `_eval-uncommitted/` overlay) and hardcodes the
  API key its plan's Security Considerations declare comes from an env var — the
  security blocker at every tier — while still running the suite/build and quoting
  Execution Evidence; and the Verify **regression tester** must FAIL a test command
  that exits 0 having collected **zero** tests (glob rot: specs renamed so
  `spec/*.check.mjs` matches nothing — probed: `node --test` with a non-matching glob
  exits 0 with `# tests 0`), the vacuous-green trap behind invariant 3. Review cases
  carry a per-case `prompt:` mirroring the orchestrator's dispatch insertions
  (`PLAN PATH` + `TIER`), their fixtures ship a real plan and mid-Develop metadata
  (authors completed, reviewer `in_progress`, plan registered via
  `plan-add`/`plan-active`), and a structure test now verifies any `docs/…` path a
  case prompt names exists in its fixture — plan renames fail at test-time, not
  bill-time. The first small-model run of the zero-tests case caught a real contract
  defect — the regression tester (a `fast`-tier agent, routed to small models in the
  balanced/economy profiles) diagnosed the zero-collection correctly but restyled its
  verdict as a bold `**FAIL**` heading instead of the machine-parsable `VERDICT:` line
  the orchestrator keys off — so its report template now pins the literal-line
  contract. The runner also forces synchronous dispatch
  (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, pinned by a structure test): since CLI
  2.1.198 dispatches run in the background by default, which would deliver reports via
  a completion notification whose summary completeness is undocumented.
- **Deeper Release/Operate mechanics** — four gaps closed in the two phases that
  previously ended at "staged + suggested". The release plan now carries a
  **human-executed rollback plan** (ITIL remediation planning): trigger conditions plus
  concrete stage-aware commands for each stage the release can reach (staged /
  committed / pushed / published), preferring deprecate-and-patch over unpublish or
  history rewrites — and the release gate grew **CHECK 8 — ROLLBACK READINESS**
  (rollback plan present, version-consistent with the staged manifest, addressed to the
  human — agents never roll back, just as they never publish), so the human holds the
  undo alongside the human-gated publish commands. The Operate telemetry monitor now
  runs a **post-release health comparison** against the pre-release baseline (equal
  windows around the latest release point) closing with one `Post-release health:
  HEALTHY | DEGRADED | UNKNOWN` verdict — honestly UNKNOWN when there is no telemetry
  or no release, never HEALTHY without data — and a DEGRADED verdict forces the cycle
  assessment to at least MAINTAIN (URGENT on a security/P0 signal). The feedback loop
  gained a **maintenance pathway** so dependency findings stop dying in the monitor's
  report: SAFE updates batch concretely into the next MAINTAIN cycle's `scope=`,
  RISKY majors / runtime EOL / modernization become proposed NFRs
  (source: `dependency-monitor`), SECURITY stays on the incident path. And it now
  **accretes failure lessons into the target repo's CLAUDE.md** under a
  `## Lessons learned (SDLC Operate)` section — one provenance-stamped standing rule
  per *actual* failure (incident lessons, the same gate FAILing 2+ times in
  `runtime.gate_log`, a DEGRADED post-release verdict), deduplicated, never touching
  anything outside its own section, and no edit at all in a failure-free cycle. A
  structure test pins all four mechanics.
- A defined **`HUMAN_REVIEW_REQUIRED` escalation protocol**: every playbook's gate loop is
  bounded (Prepare and Operate previously had no bound at all) and every bound ends in one
  block the wizard presents to the user — phase/gate, trigger, open blockers, artifacts —
  with three outcomes: **guidance** (resume the loop with the human's decision, bounds
  reset), **waive** (the gate records WAIVED, never PASS), **abort** (stop; `/sdlc` resumes
  from saved state). Agents' side of the contract lives in the `sdlc-conventions` skill.

### Changed
- Requirements Sync and the Feedback Loop no longer edit `sdlc-metadata.yml`. They report
  `REQUIREMENT_COUNTS:` / `CYCLE:` sentinel lines in their final message and the wizard —
  the metadata's single writer — records them via the state script.
- Gate reports now carry **verbatim execution evidence**: the Develop code reviewer and every
  command-running Verify agent quote the exact command, exit code, and the runner's own
  summary lines for each test/build/lint run — counts without a verbatim block are claims,
  not evidence. Structure tests pin the requirement so it can't silently regress.
- The Verify release gate no longer trusts self-reported numbers: the Validation Reviewer
  independently re-runs the test suite once and cross-checks the totals against the
  Regression Tester's runs (new gate condition d2); a report whose counts lack an evidence
  block cannot PASS its gate condition.
- **Standards citations pinned to the current edition**: the Prepare/Define anchor and the Test
  Author's testing rationale now cite **ISO/IEC/IEEE 12207:2026** (it cancels and replaces the
  2017 edition — a technical revision expanding agile/iteration concepts and clarifying
  operations/maintenance and risk/configuration management), updated across the README table,
  `CLAUDE.md`, `AUTHORS.md`, the `diagrams/` flow (Excalidraw + regenerated SVG), and the GitHub
  Pages site (`index.html` + `flow.html`); the standard chips link the accessible IEEE SA record.
  Invariant 7 / `CONTRIBUTING.md` now require bumping an edition everywhere it appears when a
  standard is revised, so a citation can't silently go stale again.

### Fixed
- The wizard's dispatch loop (Step 4) referenced playbook markers that existed in no
  playbook. It now follows the contract the playbooks actually carry: the `groups:`
  frontmatter for ordering (sequential / parallel / conditional) and each playbook's bolded
  **Gate FAIL** routing for failures — now present in all seven playbooks (Develop's and
  Verify's keep their CHANGES REQUESTED / REWORK REQUIRED verdict names). Structure tests
  pin the marker, the bound, and the orchestrator's references.
- `complete --agent` on metadata with **block-style** agent entries (name and status on
  separate lines) silently wrote nothing while reporting success. `updateStatus` now rewrites
  both agent styles the parser accepts — including a phase `status:` line placed after the
  agents block — so an update that parses is an update that lands.
- Corrupt-but-nonempty metadata (zero parseable phases) now reports `valid: false`, routing
  the wizard to its repair path instead of presenting corruption as a fresh project resuming
  at phase 1.
- `complete --status` is validated against the lifecycle statuses (`pending` / `in_progress` /
  `completed`) instead of accepting any string into the file.

## [0.2.0] — 2026

First public release.

### Added
- Trivial-tier **implementer** agent: writes code and its tests in one pass for 🟢 changes,
  cutting the trivial Develop path from 5 subagent dispatches to 3.
- Configurable **model-routing profiles** (`quality` / `balanced` / `economy`), applied per
  dispatch; full-tier agents (every reviewer/validator, planner, clarifier, authors,
  feedback-loop) always inherit the session model. New `config --model-profile` state command.
- **STRIDE-lite design-time threat modeling**: a Trust Boundaries & Threats section in the
  architecture doc, gated by a 9th design-reviewer check (Microsoft SDL).
- **Bounded gate loops** across Define / Design / Release, plus a bounded, scoped re-verify
  protocol in Verify (mechanical checks re-run in full; judgment checks scoped to the rework
  diff; human review after the cap).
- Define **requirement-ID pre-allocation** so the parallel FR/NFR/US authors never collide on
  IDs without serializing.
- Packaging for public distribution: marketplace install instructions, `CONTRIBUTING.md`, this
  changelog, and a CI workflow.

### Changed
- **License changed to GNU AGPL-3.0-or-later** (was MIT) and repository made public. Free to
  use, run, and modify — including commercially — but any distributed or network-served modified
  version must publish its source under the same license; it can't be closed-sourced or resold
  as proprietary.

## [0.1.0] — 2026

Initial release. A standards-anchored, agent-driven SDLC for Claude Code:

- One `/sdlc` wizard driving seven phases (Prepare → Define → Design → Develop → Verify →
  Release → Operate) with **35 specialized subagents**.
- Deterministic, zero-dependency state engine (`scripts/sdlc-state.mjs`) as the single source
  of metadata truth.
- The **two-zone model**: the plugin carries the process, the target repo accumulates the
  evidence.
- Live-proven end-to-end on a real external repository.
