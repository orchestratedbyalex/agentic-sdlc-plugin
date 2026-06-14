# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Updating the plugin:** because `plugin.json` declares an explicit `version`, that field
> must be bumped for Claude Code to deliver an update to installed users — a git push alone is
> not enough. Bump the version in the same change that lands user-visible behavior.

## [Unreleased]

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
- License changed to **MIT**.

## [0.1.0] — 2026

Initial release. A standards-anchored, agent-driven SDLC for Claude Code:

- One `/sdlc` wizard driving seven phases (Prepare → Define → Design → Develop → Verify →
  Release → Operate) with **35 specialized subagents**.
- Deterministic, zero-dependency state engine (`scripts/sdlc-state.mjs`) as the single source
  of metadata truth.
- The **two-zone model**: the plugin carries the process, the target repo accumulates the
  evidence.
- Live-proven end-to-end on a real external repository.
