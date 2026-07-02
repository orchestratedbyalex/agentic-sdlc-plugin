# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Updating the plugin:** because `plugin.json` declares an explicit `version`, that field
> must be bumped for Claude Code to deliver an update to installed users — a git push alone is
> not enough. Bump the version in the same change that lands user-visible behavior.

## [Unreleased]

### Added
- **Complete deterministic write surface** for `sdlc-metadata.yml`: new state commands
  `brief`, `counts`, `plan-add`, and `cycle` (the last records the Operate assessment,
  bumps the cycle counter, and resets the next cycle's phases). This closes the four
  previously-sanctioned LLM hand-edits of the metadata — the greenfield brief,
  `requirement_counts` (Define post-phase + Requirements Sync), `develop.plans`, and the
  Operate cycle block — so design invariant 2 now holds everywhere.
- The state CLI rejects unknown subcommands instead of silently falling through to `detect`.
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
