import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  return m ? m[1] : null
}

test('every agent file has name + description + tools', () => {
  const dir = join(ROOT, 'agents')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(dir, f), 'utf8'))
    assert.ok(fm, `${f}: no frontmatter`)
    assert.match(fm, /name:\s*\S+/, `${f}: no name`)
    assert.match(fm, /description:\s*\S+/, `${f}: no description`)
    assert.match(fm, /tools:\s*\S+/, `${f}: no tools`)
  }
})

test('agent name matches its filename', () => {
  const dir = join(ROOT, 'agents')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(dir, f), 'utf8'))
    const name = fm.match(/name:\s*(\S+)/)[1]
    assert.equal(name, f.replace(/\.md$/, ''), `${f}: name/filename mismatch`)
  }
})

test('every agent referenced in a phase playbook exists', () => {
  const phasesDir = join(ROOT, 'phases')
  const agentNames = new Set(
    readdirSync(join(ROOT, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  )
  for (const f of readdirSync(phasesDir).filter(f => f.endsWith('.md'))) {
    const fm = frontmatter(readFileSync(join(phasesDir, f), 'utf8'))
    // Extract agent names only from the `agents: [ ... ]` lists in the group frontmatter,
    // so unrelated `sdlc-*` tokens in prose fields (e.g. "sdlc-metadata.yml") are ignored.
    const refs = [...fm.matchAll(/agents:\s*\[([^\]]*)\]/g)]
      .flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean))
    assert.ok(refs.length > 0, `${f}: no agents listed in frontmatter`)
    for (const r of refs) {
      assert.ok(agentNames.has(r), `${f} references missing agent ${r}`)
    }
  }
})

test('all 7 phase playbooks exist', () => {
  for (const n of ['phase-1-prepare', 'phase-2-define', 'phase-3-design', 'phase-4-develop',
                   'phase-5-verify', 'phase-6-release', 'phase-7-operate']) {
    assert.ok(existsSync(join(ROOT, 'phases', `${n}.md`)), `missing ${n}.md`)
  }
})

test('the full 35-agent roster is present', () => {
  const n = readdirSync(join(ROOT, 'agents')).filter(f => f.endsWith('.md')).length
  assert.equal(n, 35, `expected 35 agent files, found ${n}`)
})

// Gate reports must carry verbatim execution evidence (audit item 3): every agent that
// runs commands (tests / build / lint) has to quote the exact command, exit code, and the
// runner's own summary lines — counts without a verbatim block are claims, not evidence.
test('command-running gate reviewers require a verbatim Execution Evidence block', () => {
  const files = [
    'sdlc-develop-code-reviewer.md',
    'sdlc-verify-coverage-analyst.md',
    'sdlc-verify-static-dynamic-analyzer.md',
    'sdlc-verify-regression-tester.md',
    'sdlc-verify-validation-reviewer.md',
  ]
  for (const f of files) {
    const text = readFileSync(join(ROOT, 'agents', f), 'utf8')
    assert.match(text, /^#{2,3} Execution Evidence/m,
      `${f}: report template lacks an Execution Evidence section`)
    assert.match(text, /verbatim/i, `${f}: no verbatim-quoting requirement`)
  }
})

test('the validation reviewer independently re-runs the suite instead of trusting reported counts', () => {
  const text = readFileSync(join(ROOT, 'agents', 'sdlc-verify-validation-reviewer.md'), 'utf8')
  assert.match(text, /independent(ly)? re-run/i,
    'validation reviewer has no independent re-run instruction')
  assert.match(text, /\bd2\b/,
    'no d2 gate condition covering the independent re-run')
})

// Failure routing is a playbook↔orchestrator contract (audit item 4): every playbook marks
// its routing with a bolded **Gate FAIL** and bounds the loop with HUMAN_REVIEW_REQUIRED —
// one sentinel name everywhere, no unnamed "escalate to the user" variants.
test('every phase playbook carries **Gate FAIL** routing bounded by HUMAN_REVIEW_REQUIRED', () => {
  const dir = join(ROOT, 'phases')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const text = readFileSync(join(dir, f), 'utf8')
    assert.match(text, /\*\*Gate FAIL/, `${f}: no **Gate FAIL** routing marker`)
    assert.match(text, /HUMAN_REVIEW_REQUIRED/, `${f}: gate loop has no HUMAN_REVIEW_REQUIRED bound`)
    assert.doesNotMatch(text, /escalate to the user/i,
      `${f}: unnamed escalation phrasing — use the HUMAN_REVIEW_REQUIRED sentinel`)
  }
})

test('the orchestrator dispatch loop references contracts that exist in the playbooks', () => {
  const text = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  assert.doesNotMatch(text, /"On failure"|"Depends on"/,
    'sdlc.md references playbook sections that exist in no playbook')
  assert.match(text, /`groups:`/, 'sdlc.md does not reference the playbook groups: frontmatter for ordering')
  assert.match(text, /\*\*Gate FAIL\*\*/, 'sdlc.md does not reference the playbooks\' **Gate FAIL** routing')
})

// Invariants 4 (git human-gated) and 2 (script-only metadata writes) are enforced by a
// PreToolUse hook (audit item 5), not just prompts: hooks.json must exist, parse, cover
// Bash plus the file-mutation tools, and run the bundled guard via ${CLAUDE_PLUGIN_ROOT}.
test('hooks/hooks.json wires the sdlc-guard to Bash and the file-mutation tools', () => {
  const p = join(ROOT, 'hooks', 'hooks.json')
  assert.ok(existsSync(p), 'missing hooks/hooks.json')
  const cfg = JSON.parse(readFileSync(p, 'utf8'))
  const entries = cfg.hooks?.PreToolUse
  assert.ok(Array.isArray(entries) && entries.length > 0, 'no PreToolUse entries')
  const matchers = entries.map(e => e.matcher)
  for (const tool of ['Bash', 'Edit', 'Write', 'MultiEdit']) {
    assert.ok(matchers.some(m => new RegExp(`^(?:${m})$`).test(tool)),
      `no PreToolUse matcher covers ${tool}`)
  }
  for (const e of entries) {
    for (const h of e.hooks) {
      assert.equal(h.type, 'command', 'hook entries must be type "command"')
      assert.match(h.command, /\$\{CLAUDE_PLUGIN_ROOT\}.*sdlc-guard\.mjs/,
        'hook must run the bundled guard via ${CLAUDE_PLUGIN_ROOT}')
    }
  }
})

// Gate outcomes are an orchestrator↔agent contract (audit item 6): every gate agent ends
// its report with one machine-parsable `VERDICT: PASS|FAIL` line (the phase's own verdict
// vocabulary stays alongside), and the orchestrator keys the gate decision off that line.
// WAIVED is never self-issued — it only enters via the HUMAN_REVIEW_REQUIRED escalation.
const GATE_AGENTS = [
  'sdlc-define-requirement-reviewer.md',
  'sdlc-design-reviewer.md',
  'sdlc-develop-code-reviewer.md',
  'sdlc-verify-coverage-analyst.md',
  'sdlc-verify-independent-code-reviewer.md',
  'sdlc-verify-static-dynamic-analyzer.md',
  'sdlc-verify-regression-tester.md',
  'sdlc-verify-validation-reviewer.md',
  'sdlc-release-reviewer.md',
]

test('every gate agent report template carries the machine-parsable VERDICT line', () => {
  for (const f of GATE_AGENTS) {
    const text = readFileSync(join(ROOT, 'agents', f), 'utf8')
    assert.match(text, /^\s*VERDICT: PASS\b/m, `${f}: template lacks a VERDICT: PASS line`)
    assert.match(text, /^\s*VERDICT: FAIL\b/m, `${f}: template lacks a VERDICT: FAIL line`)
  }
  // No agent ever self-issues a waiver — that is the human's escalation outcome.
  const dir = join(ROOT, 'agents')
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    assert.doesNotMatch(readFileSync(join(dir, f), 'utf8'), /VERDICT: WAIVED/,
      `${f}: agents never self-issue VERDICT: WAIVED`)
  }
})

test('the orchestrator and conventions skill key gates off the VERDICT line', () => {
  const sdlc = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  assert.match(sdlc, /`VERDICT: PASS\|FAIL`/,
    'sdlc.md Step 4 does not reference the VERDICT: PASS|FAIL gate line')
  const skill = readFileSync(join(ROOT, 'skills', 'sdlc-conventions', 'SKILL.md'), 'utf8')
  assert.match(skill, /^## Gate verdicts/m, 'conventions skill lacks a Gate verdicts section')
  assert.match(skill, /VERDICT: PASS/, 'conventions skill does not state the VERDICT line format')
  assert.match(skill, /WAIVED/, 'conventions skill does not state the WAIVED boundary')
})

// Invariant 1 (reviewer ≠ author) in the tool grants: gate reviewers/validators are
// read-only. The naming rule catches future reviewers automatically; the explicit
// GATE_AGENTS list covers the validators whose names don't say "reviewer".
test('gate reviewers and validators hold no write tools (invariant 1)', () => {
  const dir = join(ROOT, 'agents')
  const namedReviewers = readdirSync(dir).filter(f => /reviewer/.test(f))
  assert.ok(namedReviewers.length >= 6, 'reviewer naming rule matched fewer agents than expected')
  for (const f of namedReviewers) {
    assert.ok(GATE_AGENTS.includes(f), `${f} matches the reviewer naming rule but is not in GATE_AGENTS`)
  }
  for (const f of GATE_AGENTS) {
    const fm = frontmatter(readFileSync(join(dir, f), 'utf8'))
    const tools = fm.match(/tools:\s*(.+)/)[1].trim().split(/\s+/)
    assert.ok(tools.includes('Read'), `${f}: reviewer lacks the Read tool`)
    for (const t of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      assert.ok(!tools.includes(t), `${f}: reviewer holds write tool ${t} — reviewers are read-only`)
    }
  }
})

// The sentinel lines are the deterministic-state protocol (invariant 2): agents report
// lifecycle data in these exact templates and the orchestrator is the single writer.
// Define has no agent counterpart — its playbook has the orchestrator count the files
// and run the counts command itself.
test('sentinel line templates are pinned at their sources', () => {
  const pins = [
    ['agents/sdlc-develop-reqs-sync.md',
      /REQUIREMENT_COUNTS: functional=\S+ nonfunctional=\S+ user_stories=\S+/],
    ['agents/sdlc-operate-feedback-loop.md', /CYCLE: assessment=\S+ next_cycle=\S+/],
    ['agents/sdlc-develop-architect-planner.md', /PLAN_PATH: \S+/],
    ['agents/sdlc-develop-architect-clarifier.md', /PLAN_PATH: \S+/],
    ['phases/phase-2-define.md', /counts --functional/],
  ]
  for (const [p, re] of pins) {
    assert.match(readFileSync(join(ROOT, p), 'utf8'), re, `${p}: sentinel template missing (${re})`)
  }
})

// Model routing must assign every agent to exactly one tier (audit item 6): the table's
// Agents column lists each agent's short name (filename minus the sdlc- prefix) in
// backticks, so coverage is machine-checkable and can't drift when the roster changes.
test('the model-routing table assigns all 35 agents to exactly one tier', () => {
  const text = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  const assigned = []
  for (const tier of ['full', 'standard', 'fast']) {
    const row = text.split('\n').find(l => l.startsWith(`| **${tier}**`))
    assert.ok(row, `no ${tier} tier row in the model-routing table`)
    const agentsCell = row.split('|')[2] ?? ''
    const names = [...agentsCell.matchAll(/`([a-z0-9-]+)`/g)].map(m => `sdlc-${m[1]}`)
    assert.ok(names.length > 0, `${tier} tier row lists no backticked agent names`)
    assigned.push(...names)
  }
  const dupes = assigned.filter((n, i) => assigned.indexOf(n) !== i)
  assert.deepEqual(dupes, [], `agents assigned to more than one tier: ${dupes.join(', ')}`)
  const roster = readdirSync(join(ROOT, 'agents'))
    .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  assert.deepEqual(assigned.sort(), roster.sort(),
    'routing table does not cover the agent roster exactly')
})

test('the HUMAN_REVIEW_REQUIRED escalation protocol is defined in the orchestrator', () => {
  const text = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  assert.match(text, /^\s*HUMAN_REVIEW_REQUIRED\s*$/m, 'no HUMAN_REVIEW_REQUIRED block template')
  for (const field of ['Trigger:', 'Open blockers:', 'Artifacts:']) {
    assert.match(text, new RegExp(field), `escalation block lacks the "${field}" field`)
  }
  for (const option of ['guidance', 'waive', 'abort']) {
    assert.match(text, new RegExp(`\\*\\*${option}\\*\\*`), `escalation protocol lacks the "${option}" outcome`)
  }
})

test('the persisted loop state (runtime) is wired into the orchestrator and playbooks', () => {
  const sdlc = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  // Step 0's detector output exposes the persisted loop state; resume must read it
  assert.match(sdlc, /runtime/, 'Step 0 output list lacks runtime')
  assert.match(sdlc, /verifyCycle/, 'the orchestrator never mentions verifyCycle')
  // every gate verdict is recorded deterministically; the bounds key off the script's counts
  assert.match(sdlc, /gate-log --phase/, 'Step 4 lacks the gate-log command')
  assert.match(sdlc, /loop-reset --phase/, 'the escalation guidance outcome lacks loop-reset')
  const develop = readFileSync(join(ROOT, 'phases', 'phase-4-develop.md'), 'utf8')
  assert.match(develop, /plan-active/, 'phase 4 never persists the active plan pointer')
  assert.match(develop, /clarifier-round/, 'phase 4 never persists clarifier rounds')
  const verify = readFileSync(join(ROOT, 'phases', 'phase-5-verify.md'), 'utf8')
  assert.match(verify, /verifyCycle/, 'phase 5 still tracks the cycle count in conversation only')
})

test('the HUMAN_CHECKPOINT sign-off protocol is defined in the orchestrator', () => {
  const sdlc = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  assert.match(sdlc, /HUMAN_CHECKPOINT/, 'the orchestrator never defines the checkpoint block')
  // a checkpoint is a planned sign-off on gate-passed work, not a tripped failure bound —
  // both protocols must coexist, distinctly
  assert.match(sdlc, /HUMAN_REVIEW_REQUIRED/, 'the escalation protocol must stay alongside checkpoints')
  // proportionate ceremony: exactly three altitudes, pinned so checkpoint creep is a deliberate act
  assert.match(sdlc, /[Ee]xactly three/, 'the proportionality rule (exactly three checkpoints) is gone')
  for (const outcome of ['approve', 'adjust', 'abort']) {
    assert.match(sdlc, new RegExp(`\\*\\*${outcome}\\*\\*`), `sign-off checkpoints lack the "${outcome}" outcome`)
  }
  for (const outcome of ['go', 'defer', 'override']) {
    assert.match(sdlc, new RegExp(`\\*\\*${outcome}\\*\\*`), `the cycle go/no-go lacks the "${outcome}" outcome`)
  }
})

test('the three human checkpoints are wired at their altitudes (Define, Design, Operate)', () => {
  const define = readFileSync(join(ROOT, 'phases', 'phase-2-define.md'), 'utf8')
  assert.match(define, /HUMAN_CHECKPOINT/, 'Define completes without a human sign-off')
  const design = readFileSync(join(ROOT, 'phases', 'phase-3-design.md'), 'utf8')
  assert.match(design, /HUMAN_CHECKPOINT/, 'Design completes without a human sign-off')
  assert.match(design, /proposed/, 'Design sign-off never accepts the proposed ADRs')
  const operate = readFileSync(join(ROOT, 'phases', 'phase-7-operate.md'), 'utf8')
  assert.match(operate, /HUMAN_CHECKPOINT/, 'a new cycle can start without a human go')
  assert.match(operate, /go\/no-go/, 'phase 7 never names the go/no-go decision')
  // ADR trade-offs are decided by the human: new decisions enter proposed, the sign-off accepts them
  const adr = readFileSync(join(ROOT, 'agents', 'sdlc-design-adr-traceability-author.md'), 'utf8')
  assert.match(adr, /sign-off/, 'the ADR author still self-accepts new decisions')
  const reviewer = readFileSync(join(ROOT, 'agents', 'sdlc-design-reviewer.md'), 'utf8')
  assert.match(reviewer, /proposed/, 'the design gate would FAIL proposed (pre-sign-off) ADRs')
})

test('the eval harness is wired: opt-in runner, cases naming real agents and complete fixtures', async () => {
  assert.ok(existsSync(join(ROOT, 'evals', 'run.mjs')), 'evals/run.mjs is missing')
  const runner = readFileSync(join(ROOT, 'evals', 'run.mjs'), 'utf8')
  // the runner is billed (it invokes real models) — it must be opt-in, never a side effect
  assert.match(runner, /SDLC_EVALS/, 'run.mjs has no SDLC_EVALS opt-in gate')
  // dispatch must stay synchronous: since CLI 2.1.198 subagents run in the background by
  // default, and a background dispatch surfaces the report only through a notification
  // whose summary completeness is undocumented — the documented env switch keeps the
  // full final message in the Agent tool_result, the harness's primary extraction path
  assert.match(runner, /CLAUDE_CODE_DISABLE_BACKGROUND_TASKS/, 'run.mjs does not force synchronous dispatch')
  const { CASES } = await import('../evals/cases.mjs')
  assert.ok(Array.isArray(CASES) && CASES.length >= 2, 'the case table is empty')
  const ids = new Set()
  for (const c of CASES) {
    assert.ok(c.id && !ids.has(c.id), `case id missing or duplicated: ${c.id}`)
    ids.add(c.id)
    assert.ok(existsSync(join(ROOT, 'agents', `${c.agent}.md`)), `${c.id}: agent ${c.agent} does not exist`)
    assert.ok(['PASS', 'FAIL'].includes(c.expect.verdict), `${c.id}: expected verdict must be PASS or FAIL`)
    const fixture = join(ROOT, 'evals', 'fixtures', c.fixture)
    // every gate agent's read set: project commands, package manifest, and SDLC metadata
    for (const required of ['CLAUDE.md', 'package.json', join('docs', 'requirements', 'sdlc-metadata.yml')]) {
      assert.ok(existsSync(join(fixture, required)), `${c.id}: fixture ${c.fixture} lacks ${required}`)
    }
    // a per-case prompt that names an evidence-zone path (e.g. the PLAN the orchestrator
    // would insert) must point at a file the fixture actually ships — otherwise the drift
    // only surfaces at bill-time, as a confused agent instead of a failing test
    for (const ref of String(c.prompt ?? '').match(/docs\/[\w./-]*[\w-]/g) ?? []) {
      assert.ok(existsSync(join(fixture, ref)), `${c.id}: prompt references ${ref}, missing from fixture ${c.fixture}`)
    }
  }
})

test('eval fixtures cannot leak into node --test discovery', () => {
  // node --test executes **/*.test.js|mjs|cjs anywhere and EVERY .js|mjs|cjs under any
  // directory named test/ — a fixture matching either would run (and fail) the plugin's
  // own model-free suite, so fixture suites live in spec/*.check.mjs instead
  const offenders = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'test') offenders.push(`${path} (directory named test)`)
        walk(path)
      } else if (/\.(c|m)?js$/.test(entry.name)) {
        if (/(^|[-_.])test\.(c|m)?js$/.test(entry.name) || /^test-/.test(entry.name)) offenders.push(path)
      }
    }
  }
  walk(join(ROOT, 'evals'))
  assert.deepEqual(offenders, [], `these eval files would be executed by node --test: ${offenders.join(', ')}`)
  // and the inverse: everything executable under test/ must BE a *.test.mjs suite
  const strays = []
  const walkTests = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walkTests(path)
      else if (/\.(c|m)?js$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) strays.push(path)
    }
  }
  walkTests(join(ROOT, 'test'))
  assert.deepEqual(strays, [], `non-test executables under test/ would be run by node --test: ${strays.join(', ')}`)
})

test('the route-back recovery mechanics (reopen + evidence) are wired into the wizard and playbooks', () => {
  const sdlc = readFileSync(join(ROOT, 'commands', 'sdlc.md'), 'utf8')
  // Step 5: per-agent checkpointing is encouraged, phase completion carries an attestation,
  // and route-backs reopen the earlier phase through the state script
  assert.match(sdlc, /--evidence/, 'Step 5 never attests phase completion with --evidence')
  assert.match(sdlc, /reopen --phase/, 'the orchestrator never names the reopen command')
  const verify = readFileSync(join(ROOT, 'phases', 'phase-5-verify.md'), 'utf8')
  assert.match(verify, /reopen --phase develop/, 'phase 5 REWORK routing never reopens Develop')
  const release = readFileSync(join(ROOT, 'phases', 'phase-6-release.md'), 'utf8')
  assert.match(release, /reopen --phase verify/, 'phase 6 Verify-miss routing never reopens Verify')
})

test('Release/Operate depth: rollback plan, post-release health, maintenance pathway, rule accretion', () => {
  // the release plan carries a human-executed rollback plan (ITIL remediation planning) —
  // the human must hold the undo before running the human-gated commit/tag/push/publish
  const planner = readFileSync(join(ROOT, 'agents', 'sdlc-release-planner.md'), 'utf8')
  assert.match(planner, /ROLLBACK PLAN/i, 'the release planner drafts no rollback plan')
  assert.match(planner, /human-executed/i, 'the rollback plan is not explicitly human-executed')
  // ... and the release gate verifies it before approving publish
  const relReviewer = readFileSync(join(ROOT, 'agents', 'sdlc-release-reviewer.md'), 'utf8')
  assert.match(relReviewer, /CHECK 8 — ROLLBACK READINESS/, 'the release gate never validates rollback readiness')
  assert.match(relReviewer, /8-point/, 'the release gate still calls itself 7-point')
  const release = readFileSync(join(ROOT, 'phases', 'phase-6-release.md'), 'utf8')
  assert.match(release, /rollback/i, 'phase 6 hands the human the publish commands without the undo')
  // the telemetry monitor compares post-release health against the pre-release baseline,
  // with an honest UNKNOWN (never HEALTHY without data) when telemetry is absent
  const telemetry = readFileSync(join(ROOT, 'agents', 'sdlc-operate-telemetry-monitor.md'), 'utf8')
  assert.match(telemetry, /POST-RELEASE HEALTH/i, 'the telemetry monitor never compares post-release health')
  assert.match(telemetry, /HEALTHY \| DEGRADED \| UNKNOWN/, 'the post-release verdict vocabulary (incl. honest UNKNOWN) is missing')
  // ... and the feedback loop routes findings into the next cycle instead of letting them
  // die in reports: DEGRADED forces at least MAINTAIN, maintenance work gets a pathway,
  // failure lessons accrete as standing rules in the target's CLAUDE.md
  const loop = readFileSync(join(ROOT, 'agents', 'sdlc-operate-feedback-loop.md'), 'utf8')
  assert.match(loop, /DEGRADED/, 'the cycle assessment ignores a degraded release')
  assert.match(loop, /MAINTENANCE PATHWAY/i, 'maintenance findings still die in the dependency report')
  assert.match(loop, /Lessons learned \(SDLC Operate\)/, 'no rule-accretion contract for the target CLAUDE.md')
  assert.match(loop, /gate_log/, 'rule accretion never mines repeated gate FAILs')
  const operate = readFileSync(join(ROOT, 'phases', 'phase-7-operate.md'), 'utf8')
  assert.match(operate, /accret/i, 'phase 7 never names the rule-accretion output')
  assert.match(operate, /post-release/i, 'phase 7 never names the post-release comparison')
})
