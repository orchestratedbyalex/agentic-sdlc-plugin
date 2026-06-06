---
phase: release
phase_number: 6
setup: ""
groups:
  - { mode: sequential, agents: [sdlc-release-planner] }
  - { mode: sequential, agents: [sdlc-release-author] }
  - { mode: sequential, agents: [sdlc-release-reviewer] }
gate_after_each_group: true
post_phase: "set release.status + agent statuses completed; publish + push are EXCLUDED (require human approval)"
---

# Phase 6 — Release (Transition)

Prerequisite: Verify completed with READY FOR RELEASE.

1. **release-planner** — reads the manifest, changelog, metadata, and git log since the last
   tag; produces a release plan (passed forward via context).
2. **release-author** — applies the plan: prepends the changelog entry, bumps the manifest
   version, runs the build, creates a git commit + tag. **Does NOT push or publish.**
3. **release-reviewer** — 7-point gate (version consistency, changelog accuracy, semver,
   build artifacts, package exports, sensitive-file exclusion, dependency audit).
   - **Gate FAIL:** route issues to release-author, re-run, re-review until PASS.

**On completion:** set every `release.agents.*.status` and `release.status` to `"completed"`.
**Publishing to a registry and pushing the remote are intentionally left to a human** —
report that the tag + artifacts are ready and how to publish.
