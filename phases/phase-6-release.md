---
phase: release
phase_number: 6
setup: ""
groups:
  - { mode: sequential, agents: [sdlc-release-planner] }
  - { mode: sequential, agents: [sdlc-release-author] }
  - { mode: sequential, agents: [sdlc-release-reviewer] }
gate_after_each_group: true
post_phase: "set release.status + agent statuses completed; the release is STAGED with a suggested commit + tag — commit, tag, push, and publish are ALL human-gated (do none of them)"
---

# Phase 6 — Release (Transition)

Prerequisite: Verify completed with READY FOR RELEASE (which now includes a clean
production build — see Phase 5).

1. **release-planner** — reads the manifest, changelog, metadata, and git log since the last
   tag; produces a release plan (passed forward via context).
2. **release-author** — applies the plan: prepends the changelog entry, bumps the manifest
   version, runs the build, then **stages the change and suggests the commit + tag**. It does
   **NOT commit, tag, push, or publish** — all are human-gated.
   - **Build fails?** Triage first: if the build was ALREADY broken before this release's diff
     (pre-existing toolchain rot), that is a **Verify-gate miss**, not a release task. STOP and
     route back — do NOT rewrite the target's dependency tree, add `resolutions`/overrides, pin
     transitive deps, monkey-patch `node_modules`, or add `postinstall` patches. Only fix a
     break caused by this release's own changelog/version/manifest edits, minimally.
3. **release-reviewer** — 7-point gate (version consistency of the STAGED release, changelog
   accuracy, semver, build artifacts, package exports, sensitive-file exclusion, dependency
   audit). An author that committed/tagged on its own is a discipline FAIL.
   - **Gate FAIL:** route issues to release-author, re-run, re-review until PASS.

**On completion:** set every `release.agents.*.status` and `release.status` to `"completed"`.
The release is **staged** with a suggested commit message + tag command. **Creating the commit
and tag, pushing the remote, and publishing to a registry are intentionally left to a human** —
report that the artifacts are staged and ready, and give the exact commit/tag/push/publish
commands for the human to run.
