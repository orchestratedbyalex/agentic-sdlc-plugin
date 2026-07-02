import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMetadata } from '../scripts/sdlc-state.mjs'

const SAMPLE = `sdlc:
  project: "demo"
  version: "1.2.3"
  phases:
    prepare:
      status: "completed"
    develop:
      status: "in_progress"
      agents:
        architect_planner:
          status: "completed"
        code_author:
          status: "pending"
`

test('parseMetadata reads project and version', () => {
  const md = parseMetadata(SAMPLE)
  assert.equal(md.valid, true)
  assert.equal(md.project, 'demo')
  assert.equal(md.version, '1.2.3')
})

test('parseMetadata reads phase status', () => {
  const md = parseMetadata(SAMPLE)
  assert.equal(md.phases.prepare.status, 'completed')
  assert.equal(md.phases.develop.status, 'in_progress')
})

test('parseMetadata reads per-agent status in order', () => {
  const md = parseMetadata(SAMPLE)
  assert.deepEqual(
    md.phases.develop.agents.map(a => [a.name, a.status]),
    [['architect_planner', 'completed'], ['code_author', 'pending']]
  )
})

test('parseMetadata marks empty content invalid', () => {
  assert.equal(parseMetadata('').valid, false)
})

test('parseMetadata marks nonempty garbage invalid (zero phases parsed)', () => {
  assert.equal(parseMetadata('!!! this is not sdlc metadata {{{').valid, false)
  assert.equal(parseMetadata('foo: bar\nbaz: qux\n').valid, false)
})

import { computeState } from '../scripts/sdlc-state.mjs'

test('computeState: no metadata + no code = greenfield', () => {
  const s = computeState({ hasMetadata: false, metadataContent: '', hasCode: false })
  assert.equal(s.mode, 'greenfield')
  assert.equal(s.phase, 1)
  assert.equal(s.setupComplete, false)
  assert.equal(s.board.length, 7)
  assert.ok(s.board.every(p => p.status === 'pending'))
})

test('computeState: no metadata + code = existing', () => {
  const s = computeState({ hasMetadata: false, metadataContent: '', hasCode: true })
  assert.equal(s.mode, 'existing')
  assert.equal(s.phase, 1)
})

const MIDWAY = `sdlc:
  project: "midway"
  version: "0.2.0"
  phases:
    prepare:
      status: "completed"
      agents:
        explorer: { status: "completed" }
        claude_md: { status: "completed" }
    define:
      status: "completed"
      agents:
        source_analyst: { status: "completed" }
        requirement_reviewer: { status: "completed" }
    design:
      status: "completed"
      agents:
        architecture_explorer: { status: "completed" }
        design_reviewer: { status: "completed" }
    develop:
      status: "in_progress"
      agents:
        architect_planner:
          status: "completed"
        code_author:
          status: "completed"
        test_author:
          status: "pending"
    verify:
      status: "pending"
`

test('computeState: resume finds first non-completed phase', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.mode, 'resume')
  assert.equal(s.phase, 4) // develop
})

test('computeState: resume finds first non-completed agent (fine-grained)', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.agent, 'test_author')
})

test('computeState: setupComplete true when prepare+define+design done', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.setupComplete, true)
})

test('computeState: reads project/version on resume', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.project, 'midway')
  assert.equal(s.version, '0.2.0')
})

test('computeState: corrupt metadata = valid false', () => {
  const s = computeState({ hasMetadata: true, metadataContent: '', hasCode: true })
  assert.equal(s.valid, false)
})

test('computeState: nonempty-garbage metadata routes to the repair path, not a fresh board', () => {
  const s = computeState({ hasMetadata: true, metadataContent: 'corrupted beyond recognition', hasCode: true })
  assert.equal(s.valid, false)
  assert.equal(s.phase, null) // must NOT present as a clean resume at phase 1
})

import { detectCode } from '../scripts/sdlc-state.mjs'

test('detectCode: manifest present', () => {
  assert.equal(detectCode('/x', ['README.md', 'package.json']), true)
})

test('detectCode: source extension present', () => {
  assert.equal(detectCode('/x', ['main.py']), true)
})

test('detectCode: docs only = no code', () => {
  assert.equal(detectCode('/x', ['README.md', 'notes.txt']), false)
})

import { initMetadata } from '../scripts/sdlc-state.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../templates/sdlc-metadata.yml'),
  'utf8'
)

const FLOW = `sdlc:
  project: "flowdemo"
  version: "0.9.0"
  phases:
    prepare:
      status: "completed"
    develop:
      status: "in_progress"
      agents:
        architect_planner: { status: "completed" }
        code_author: { status: "pending" }
`

test('parseMetadata reads flow-style agent entries', () => {
  const md = parseMetadata(FLOW)
  assert.equal(md.valid, true)
  assert.deepEqual(
    md.phases.develop.agents.map(a => [a.name, a.status]),
    [['architect_planner', 'completed'], ['code_author', 'pending']]
  )
})

test('initMetadata substitutes name, version, and mode', () => {
  const out = initMetadata(TEMPLATE, { name: 'wordAnalyzer', version: '0.1.0', mode: 'existing' })
  assert.match(out, /project:\s*"wordAnalyzer"/)
  assert.match(out, /version:\s*"0\.1\.0"/)
  assert.match(out, /mode:\s*"existing"/)
  assert.ok(!out.includes('PROJECT_NAME'), 'PROJECT_NAME not substituted')
  assert.ok(!out.includes('"VERSION"'), 'VERSION not substituted')
  assert.ok(!out.includes('"MODE"'), 'MODE not substituted')
})

test('initMetadata output round-trips through parseMetadata with full 35-agent roster', () => {
  const out = initMetadata(TEMPLATE, { name: 'rt', version: '2.0.0', mode: 'greenfield' })
  const md = parseMetadata(out)
  assert.equal(md.valid, true)
  assert.equal(md.project, 'rt')
  assert.equal(md.version, '2.0.0')
  const total = Object.values(md.phases).reduce((n, p) => n + p.agents.length, 0)
  assert.equal(total, 35, `expected 35 agents parsed, got ${total}`)
})

import { updateStatus } from '../scripts/sdlc-state.mjs'

test('updateStatus completes a whole phase (status + every agent)', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const md = parseMetadata(updateStatus(base, { phase: 'prepare', status: 'completed' }))
  assert.equal(md.phases.prepare.status, 'completed')
  assert.ok(md.phases.prepare.agents.every(a => a.status === 'completed'))
  // adjacent phases untouched
  assert.equal(md.phases.define.status, 'pending')
  assert.ok(md.phases.define.agents.every(a => a.status === 'pending'))
})

test('updateStatus completes a single agent without touching the phase or siblings', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const md = parseMetadata(updateStatus(base, { phase: 'define', agent: 'source_analyst', status: 'completed' }))
  assert.equal(md.phases.define.status, 'pending')
  const byName = Object.fromEntries(md.phases.define.agents.map(a => [a.name, a.status]))
  assert.equal(byName.source_analyst, 'completed')
  assert.equal(byName.test_analyst, 'pending')
})

test('updateStatus then computeState advances to the next phase', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const out = updateStatus(base, { phase: 'prepare', status: 'completed' })
  const s = computeState({ hasMetadata: true, metadataContent: out, hasCode: true })
  assert.equal(s.phase, 2)
  assert.equal(s.agent, 'source_analyst')
})

test('develop.plans key does not disrupt agent parsing', () => {
  const md = parseMetadata(initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' }))
  assert.equal(md.valid, true)
  // the new `plans: []` sibling under develop must not swallow or drop agents
  assert.equal(md.phases.develop.agents.length, 7)
  assert.equal(md.phases.develop.agents[0].name, 'architect_planner')
})

import { setModelProfile, MODEL_PROFILES } from '../scripts/sdlc-state.mjs'

test('parseMetadata reads model_profile from the template (comment ignored)', () => {
  const md = parseMetadata(initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' }))
  assert.equal(md.modelProfile, 'balanced')
})

test('computeState defaults modelProfile to balanced when the key is absent (legacy metadata)', () => {
  const s = computeState({ hasMetadata: true, metadataContent: MIDWAY, hasCode: true })
  assert.equal(s.modelProfile, 'balanced')
})

test('computeState surfaces the configured modelProfile', () => {
  const out = setModelProfile(initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' }), 'economy')
  const s = computeState({ hasMetadata: true, metadataContent: out, hasCode: true })
  assert.equal(s.modelProfile, 'economy')
})

test('setModelProfile replaces an existing value in place', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const out = setModelProfile(base, 'quality')
  assert.equal(parseMetadata(out).modelProfile, 'quality')
  // exactly one model_profile line, and the phases block is untouched
  assert.equal(out.split('\n').filter(l => /^\s{2}model_profile:/.test(l)).length, 1)
  assert.equal(parseMetadata(out).phases.develop.agents.length, 7)
})

test('setModelProfile inserts the key into legacy metadata without one', () => {
  const out = setModelProfile(MIDWAY, 'quality')
  const md = parseMetadata(out)
  assert.equal(md.modelProfile, 'quality')
  // existing content still parses
  assert.equal(md.phases.prepare.status, 'completed')
  assert.equal(md.project, 'midway')
  assert.ok(MODEL_PROFILES.includes('quality'))
})

// ── setupComplete must verify agent evidence, not trust phase.status alone ──

test('computeState: a completed setup phase with a PENDING agent is NOT setup-complete', () => {
  const md = `sdlc:
  project: "x"
  version: "0.1.0"
  phases:
    prepare:
      status: "completed"
      agents:
        explorer: { status: "pending" }
        claude_md: { status: "completed" }
    define:
      status: "completed"
      agents:
        source_analyst: { status: "completed" }
    design:
      status: "completed"
      agents:
        design_reviewer: { status: "completed" }
`
  assert.equal(computeState({ hasMetadata: true, metadataContent: md, hasCode: true }).setupComplete, false)
})

test('computeState: a completed setup phase with NO agents listed is NOT setup-complete', () => {
  const md = `sdlc:
  project: "x"
  version: "0.1.0"
  phases:
    prepare:
      status: "completed"
    define:
      status: "completed"
    design:
      status: "completed"
`
  assert.equal(computeState({ hasMetadata: true, metadataContent: md, hasCode: true }).setupComplete, false)
})

// ── setModelProfile robustness ──

test('setModelProfile removes duplicate model_profile lines (idempotent, no stale survivor)', () => {
  const dup = `sdlc:
  project: "x"
  version: "0.1.0"
  model_profile: "quality"
  model_profile: "quality"
  phases:
    prepare:
      status: "pending"
`
  const out = setModelProfile(dup, 'economy')
  assert.equal(out.split('\n').filter(l => /^\s{2}model_profile:/.test(l)).length, 1)
  assert.equal(parseMetadata(out).modelProfile, 'economy')
})

test('setModelProfile on an anchorless file appends, never inserting above the root', () => {
  const out = setModelProfile('foo: bar\nbaz: qux\n', 'economy')
  assert.doesNotMatch(out.split('\n')[0], /model_profile/) // not forced to line 0
  assert.equal(out.split('\n').filter(l => /model_profile:/.test(l)).length, 1)
})

// ── hyphen tolerance in agent names ──

const HYPHEN_AGENT = `sdlc:
  project: "x"
  version: "0.1.0"
  phases:
    prepare:
      status: "pending"
      agents:
        my-agent: { status: "pending" }
`

test('parseMetadata tolerates hyphens in agent names', () => {
  assert.deepEqual(parseMetadata(HYPHEN_AGENT).phases.prepare.agents.map(a => a.name), ['my-agent'])
})

test('updateStatus tolerates hyphens in agent names', () => {
  const out = updateStatus(HYPHEN_AGENT, { phase: 'prepare', agent: 'my-agent', status: 'completed' })
  assert.equal(parseMetadata(out).phases.prepare.agents[0].status, 'completed')
})

// ── setBrief: deterministic sdlc.brief block (no LLM hand-edit) ──

import { setBrief } from '../scripts/sdlc-state.mjs'

const BRIEF = { purpose: 'CLI word counter', stack: 'Node 22', users: 'devs', keyFeatures: 'count, top-N' }

test('setBrief inserts a brief block without disturbing the rest of the file', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'greenfield' })
  const out = setBrief(base, BRIEF)
  assert.match(out, /^ {2}brief:$/m)
  assert.match(out, /^ {4}purpose: "CLI word counter"$/m)
  assert.match(out, /^ {4}stack: "Node 22"$/m)
  assert.match(out, /^ {4}users: "devs"$/m)
  assert.match(out, /^ {4}key_features: "count, top-N"$/m)
  const md = parseMetadata(out)
  assert.equal(md.valid, true)
  assert.equal(md.project, 'x')
  const total = Object.values(md.phases).reduce((n, p) => n + p.agents.length, 0)
  assert.equal(total, 35)
})

test('setBrief is idempotent — a second call replaces, never duplicates', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'greenfield' })
  const out = setBrief(setBrief(base, BRIEF), { ...BRIEF, purpose: 'updated purpose' })
  assert.equal(out.split('\n').filter(l => /^ {2}brief:$/.test(l)).length, 1)
  assert.equal(out.split('\n').filter(l => /^ {4}purpose:/.test(l)).length, 1)
  assert.match(out, /^ {4}purpose: "updated purpose"$/m)
  assert.doesNotMatch(out, /CLI word counter/)
})

test('setBrief escapes double quotes and newlines in values', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'greenfield' })
  const out = setBrief(base, { ...BRIEF, purpose: 'a "quoted"\nvalue' })
  assert.match(out, /^ {4}purpose: "a \\"quoted\\" value"$/m)
  assert.equal(parseMetadata(out).valid, true)
})

test('setBrief on an anchorless file appends, never inserting above the root', () => {
  const out = setBrief('foo: bar\n', BRIEF)
  assert.doesNotMatch(out.split('\n')[0], /brief/)
  assert.match(out, /^ {2}brief:$/m)
})

// ── setRequirementCounts: deterministic requirement_counts (no LLM hand-edit) ──

import { setRequirementCounts } from '../scripts/sdlc-state.mjs'

test('setRequirementCounts updates the three counts in place', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const out = setRequirementCounts(base, { functional: 12, nonfunctional: 4, userStories: 9 })
  assert.match(out, /^ {4}functional: 12$/m)
  assert.match(out, /^ {4}nonfunctional: 4$/m)
  assert.match(out, /^ {4}user_stories: 9$/m)
  const md = parseMetadata(out)
  assert.equal(md.valid, true)
  const total = Object.values(md.phases).reduce((n, p) => n + p.agents.length, 0)
  assert.equal(total, 35)
})

test('setRequirementCounts inserts the block into legacy metadata without one', () => {
  const out = setRequirementCounts(MIDWAY, { functional: 3, nonfunctional: 1, userStories: 2 })
  assert.match(out, /^ {2}requirement_counts:$/m)
  assert.match(out, /^ {4}functional: 3$/m)
  const md = parseMetadata(out)
  assert.equal(md.project, 'midway')
  assert.equal(md.phases.develop.agents.length, 3)
})

test('setRequirementCounts is idempotent — exactly one block after repeated calls', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const out = setRequirementCounts(setRequirementCounts(base, { functional: 1, nonfunctional: 1, userStories: 1 }), { functional: 2, nonfunctional: 2, userStories: 2 })
  assert.equal(out.split('\n').filter(l => /^ {2}requirement_counts:$/.test(l)).length, 1)
  assert.equal(out.split('\n').filter(l => /^ {4}functional:/.test(l)).length, 1)
  assert.match(out, /^ {4}functional: 2$/m)
})

// ── appendPlan: deterministic develop.plans append (single writer, no hand-edit) ──

import { appendPlan } from '../scripts/sdlc-state.mjs'

test('appendPlan adds the first id to the empty flow list', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const out = appendPlan(base, 'PLAN-001')
  assert.match(out, /^ {6}plans: \["PLAN-001"\]$/m)
  const md = parseMetadata(out)
  assert.equal(md.valid, true)
  assert.equal(md.phases.develop.agents.length, 7)
})

test('appendPlan preserves earlier ids when appending', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const out = appendPlan(appendPlan(base, 'PLAN-001'), 'PLAN-002')
  assert.match(out, /^ {6}plans: \["PLAN-001", "PLAN-002"\]$/m)
})

test('appendPlan is idempotent on a duplicate id', () => {
  const base = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  const once = appendPlan(base, 'PLAN-001')
  assert.equal(appendPlan(once, 'PLAN-001'), once)
})

test('appendPlan inserts a plans line into legacy metadata without one', () => {
  const out = appendPlan(MIDWAY, 'PLAN-007')
  assert.match(out, /^ {6}plans: \["PLAN-007"\]$/m)
  const md = parseMetadata(out)
  assert.equal(md.phases.develop.agents.length, 3) // agents untouched
  assert.equal(md.phases.develop.status, 'in_progress')
})

test('appendPlan returns null when there is no develop phase to write under', () => {
  assert.equal(appendPlan('foo: bar\n', 'PLAN-001'), null)
})

// ── recordCycle: deterministic Operate cycle assessment + phase resets ──

import { recordCycle, ASSESSMENTS, PHASES } from '../scripts/sdlc-state.mjs'

function allCompleted() {
  let out = initMetadata(TEMPLATE, { name: 'x', version: '0.1.0', mode: 'existing' })
  for (const p of PHASES) out = updateStatus(out, { phase: p, status: 'completed' })
  return out
}

test('recordCycle stable: records the assessment, resets nothing, lifecycle complete', () => {
  const out = recordCycle(allCompleted(), { assessment: 'stable', nextCycle: false, date: '2026-07-02' })
  assert.match(out, /^ {6}completed: "2026-07-02"$/m)
  assert.match(out, /^ {6}assessment: "stable"$/m)
  assert.match(out, /^ {6}next_cycle: false$/m)
  assert.match(out, /^ {2}cycle: 1$/m)
  const md = parseMetadata(out)
  assert.ok(PHASES.every(p => md.phases[p].status === 'completed'))
  const s = computeState({ hasMetadata: true, metadataContent: out, hasCode: true })
  assert.equal(s.phase, null)
})

test('recordCycle maintain: resets develop..operate to pending (agents too), keeps define/design', () => {
  const out = recordCycle(allCompleted(), { assessment: 'maintain', nextCycle: true, scope: 'patch deps', date: '2026-07-02' })
  assert.match(out, /^ {6}next_cycle: true$/m)
  assert.match(out, /^ {6}next_cycle_scope: "patch deps"$/m)
  const md = parseMetadata(out)
  assert.equal(md.phases.define.status, 'completed')
  assert.equal(md.phases.design.status, 'completed')
  for (const p of ['develop', 'verify', 'release', 'operate']) {
    assert.equal(md.phases[p].status, 'pending', p)
    assert.ok(md.phases[p].agents.every(a => a.status === 'pending'), `${p} agents reset`)
  }
  const s = computeState({ hasMetadata: true, metadataContent: out, hasCode: true })
  assert.equal(s.phase, 4) // next cycle resumes at Develop
  assert.equal(s.setupComplete, true)
})

test('recordCycle evolve: resets define..operate, keeps prepare, resumes at Define', () => {
  const out = recordCycle(allCompleted(), { assessment: 'evolve', nextCycle: true, date: '2026-07-02' })
  const md = parseMetadata(out)
  assert.equal(md.phases.prepare.status, 'completed')
  assert.equal(md.phases.define.status, 'pending')
  assert.equal(computeState({ hasMetadata: true, metadataContent: out, hasCode: true }).phase, 2)
})

test('recordCycle urgent: records the urgent block and resets like maintain', () => {
  const out = recordCycle(allCompleted(), { assessment: 'urgent', nextCycle: true, reason: 'INC-001', date: '2026-07-02' })
  assert.match(out, /^ {6}urgent:$/m)
  assert.match(out, /^ {8}triggered: "2026-07-02"$/m)
  assert.match(out, /^ {8}reason: "INC-001"$/m)
  const md = parseMetadata(out)
  assert.equal(md.phases.develop.status, 'pending')
  assert.equal(md.phases.define.status, 'completed')
})

test('recordCycle increments the cycle counter and replaces fields, never duplicating', () => {
  const first = recordCycle(allCompleted(), { assessment: 'maintain', nextCycle: true, date: '2026-01-01' })
  let redone = first
  for (const p of ['develop', 'verify', 'release', 'operate']) redone = updateStatus(redone, { phase: p, status: 'completed' })
  const second = recordCycle(redone, { assessment: 'stable', nextCycle: false, date: '2026-07-02' })
  assert.match(second, /^ {2}cycle: 2$/m)
  assert.equal(second.split('\n').filter(l => /^ {2}cycle:/.test(l)).length, 1)
  assert.equal(second.split('\n').filter(l => /^ {6}assessment:/.test(l)).length, 1)
  assert.match(second, /^ {6}assessment: "stable"$/m)
  assert.doesNotMatch(second, /next_cycle_scope/) // stale maintain fields cleared
  const md = parseMetadata(second)
  assert.equal(md.valid, true)
  const total = Object.values(md.phases).reduce((n, p) => n + p.agents.length, 0)
  assert.equal(total, 35)
  assert.ok(ASSESSMENTS.includes('stable'))
})

test('recordCycle returns null on an unknown assessment', () => {
  assert.equal(recordCycle(allCompleted(), { assessment: 'panic', nextCycle: true, date: '2026-07-02' }), null)
})

// ── CLI integration: the `complete` command's guards (run the real script) ──

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../scripts/sdlc-state.mjs')
function runCLI(cwd, args) {
  try {
    return { code: 0, json: JSON.parse(execFileSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' })) }
  } catch (e) {
    return { code: e.status ?? 1, json: JSON.parse(e.stdout) } // non-zero exit still prints our JSON
  }
}

test('CLI: complete --agent with an unknown agent fails loudly (no silent no-op)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  assert.equal(runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing']).json.ok, true)
  const bad = runCLI(dir, ['complete', '--phase', 'prepare', '--agent', 'does_not_exist'])
  assert.equal(bad.json.ok, false)
  assert.match(bad.json.error, /unknown agent/)
  assert.equal(runCLI(dir, ['complete', '--phase', 'prepare', '--agent', 'explorer']).json.ok, true)
})

test('CLI: brief records the greenfield brief deterministically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'greenfield'])
  const r = runCLI(dir, ['brief', '--purpose', 'word counter', '--stack', 'Node 22', '--users', 'devs', '--key-features', 'count, top-N'])
  assert.equal(r.json.ok, true)
  const y = readFileSync(join(dir, 'docs/requirements/sdlc-metadata.yml'), 'utf8')
  assert.match(y, /^ {4}purpose: "word counter"$/m)
  assert.match(y, /^ {4}key_features: "count, top-N"$/m)
})

test('CLI: brief fails loudly when a flag is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'greenfield'])
  const r = runCLI(dir, ['brief', '--purpose', 'p', '--stack', 's', '--users', 'u'])
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /--key-features/)
})

test('CLI: counts writes the totals and rejects non-integers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  const ok = runCLI(dir, ['counts', '--functional', '5', '--nonfunctional', '2', '--user-stories', '3'])
  assert.equal(ok.json.ok, true)
  const y = readFileSync(join(dir, 'docs/requirements/sdlc-metadata.yml'), 'utf8')
  assert.match(y, /^ {4}functional: 5$/m)
  const bad = runCLI(dir, ['counts', '--functional', 'five', '--nonfunctional', '2', '--user-stories', '3'])
  assert.equal(bad.json.ok, false)
})

test('CLI: plan-add appends once, is idempotent, and validates the id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  assert.deepEqual(runCLI(dir, ['plan-add', '--id', 'PLAN-001']).json.plans, ['PLAN-001'])
  assert.deepEqual(runCLI(dir, ['plan-add', '--id', 'PLAN-001']).json.plans, ['PLAN-001'])
  assert.deepEqual(runCLI(dir, ['plan-add', '--id', 'PLAN-002']).json.plans, ['PLAN-001', 'PLAN-002'])
  assert.equal(runCLI(dir, ['plan-add', '--id', 'PLAN 001']).json.ok, false)
})

test('CLI: cycle enforces the assessment/next-cycle contract and reports the counter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  assert.equal(runCLI(dir, ['cycle', '--assessment', 'stable', '--next-cycle', 'true']).json.ok, false)
  assert.equal(runCLI(dir, ['cycle', '--assessment', 'maintain', '--next-cycle', 'false']).json.ok, false)
  assert.equal(runCLI(dir, ['cycle', '--assessment', 'urgent', '--next-cycle', 'true']).json.ok, false) // no --reason
  assert.equal(runCLI(dir, ['cycle', '--assessment', 'panic', '--next-cycle', 'true']).json.ok, false)
  const ok = runCLI(dir, ['cycle', '--assessment', 'STABLE', '--next-cycle', 'false']) // agent verdicts are uppercase
  assert.equal(ok.json.ok, true)
  assert.equal(ok.json.cycle, 1)
  const y = readFileSync(join(dir, 'docs/requirements/sdlc-metadata.yml'), 'utf8')
  assert.match(y, /^ {6}assessment: "stable"$/m)
})

test('CLI: an unknown command fails loudly instead of silently running detect', () => {
  const r = runCLI(mkdtempSync(join(tmpdir(), 'sdlc-cli-')), ['breif'])
  assert.equal(r.json.ok, false)
  assert.match(r.json.error, /unknown command/)
})

// ── updateStatus must handle block-style agent entries, not just flow style ──
// parseMetadata accepts both styles, so the unknown-agent guard passes on a block-style
// file while updateStatus rewrote nothing — a silent no-op reported as ok:true.

test('updateStatus completes a block-style agent entry (no silent no-op)', () => {
  const out = updateStatus(MIDWAY, { phase: 'develop', agent: 'test_author', status: 'completed' })
  assert.notEqual(out, MIDWAY, 'a block-style agent update must actually change the file')
  const md = parseMetadata(out)
  const byName = Object.fromEntries(md.phases.develop.agents.map(a => [a.name, a.status]))
  assert.equal(byName.test_author, 'completed')
  assert.equal(byName.architect_planner, 'completed')
  assert.equal(md.phases.develop.status, 'in_progress') // agent update leaves the phase status alone
})

test('updateStatus targeting one block-style agent leaves its block-style siblings alone', () => {
  const out = updateStatus(MIDWAY, { phase: 'develop', agent: 'architect_planner', status: 'in_progress' })
  const byName = Object.fromEntries(parseMetadata(out).phases.develop.agents.map(a => [a.name, a.status]))
  assert.equal(byName.architect_planner, 'in_progress')
  assert.equal(byName.code_author, 'completed')
  assert.equal(byName.test_author, 'pending')
})

test('updateStatus whole-phase update also rewrites block-style agents', () => {
  const md = parseMetadata(updateStatus(MIDWAY, { phase: 'develop', status: 'completed' }))
  assert.equal(md.phases.develop.status, 'completed')
  assert.ok(md.phases.develop.agents.every(a => a.status === 'completed'), 'block-style agents completed too')
  assert.ok(md.phases.design.agents.every(a => a.status === 'completed')) // neighbors untouched
  assert.equal(md.phases.verify.status, 'pending')
})

test('updateStatus whole-phase reaches a phase status line placed AFTER the agents block', () => {
  const md = `sdlc:
  project: "x"
  version: "0.1.0"
  phases:
    prepare:
      agents:
        explorer: { status: "pending" }
      status: "pending"
`
  const out = parseMetadata(updateStatus(md, { phase: 'prepare', status: 'completed' }))
  assert.equal(out.phases.prepare.status, 'completed')
  assert.equal(out.phases.prepare.agents[0].status, 'completed')
})

test('updateStatus never mistakes recordCycle urgent fields (triggered/reason) for agents', () => {
  const cycled = recordCycle(allCompleted(), { assessment: 'urgent', nextCycle: true, reason: 'INC-001', date: '2026-07-02' })
  const out = updateStatus(cycled, { phase: 'operate', status: 'completed' })
  assert.match(out, /^ {8}triggered: "2026-07-02"$/m)
  assert.match(out, /^ {8}reason: "INC-001"$/m)
  assert.equal(parseMetadata(out).valid, true)
})

test('CLI: complete --agent on block-style metadata really writes (was ok:true with no write)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  mkdirSync(join(dir, 'docs/requirements'), { recursive: true })
  writeFileSync(join(dir, 'docs/requirements/sdlc-metadata.yml'), MIDWAY)
  const r = runCLI(dir, ['complete', '--phase', 'develop', '--agent', 'test_author'])
  assert.equal(r.json.ok, true)
  const y = readFileSync(join(dir, 'docs/requirements/sdlc-metadata.yml'), 'utf8')
  const byName = Object.fromEntries(parseMetadata(y).phases.develop.agents.map(a => [a.name, a.status]))
  assert.equal(byName.test_author, 'completed')
})

test('CLI: complete validates --status against the known lifecycle statuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  const bad = runCLI(dir, ['complete', '--phase', 'prepare', '--status', 'done'])
  assert.equal(bad.json.ok, false)
  assert.match(bad.json.error, /--status/)
  const ok = runCLI(dir, ['complete', '--phase', 'prepare', '--agent', 'explorer', '--status', 'in_progress'])
  assert.equal(ok.json.ok, true)
})

test('CLI: setupComplete only after every setup phase AND its agents complete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  // completing one agent of prepare must NOT unlock setup
  assert.equal(runCLI(dir, ['complete', '--phase', 'prepare', '--agent', 'explorer']).json.setupComplete, false)
  runCLI(dir, ['complete', '--phase', 'prepare'])
  runCLI(dir, ['complete', '--phase', 'define'])
  assert.equal(runCLI(dir, ['complete', '--phase', 'design']).json.setupComplete, true)
})

// ── Persisted loop state: the script-owned `runtime:` block ──
// Strike counters, clarifier rounds, the active plan, and the gate-verdict log live in
// the metadata (not in the orchestrator's conversation), so an interruption no longer
// resets the 3-strike bounds or the Verify cycle count.

const WITH_RUNTIME = `sdlc:
  project: "demo"
  version: "1.2.3"
  phases:
    develop:
      status: "in_progress"
      agents:
        code_author: { status: "pending" }
    verify:
      status: "pending"
      agents:
        validation_reviewer: { status: "pending" }
  runtime:
    active_plan: "PLAN-003"
    gate_attempts:
      develop: 2
      verify: 1
    clarifier_rounds:
      code_author: 1
    gate_log:
      - "2026-07-01 develop code_reviewer FAIL -- 3 blockers"
      - "2026-07-02 develop code_reviewer PASS"
`

const EMPTY_RUNTIME = { activePlan: null, gateAttempts: {}, clarifierRounds: {}, gateLog: [] }

test('parseMetadata reads the script-owned runtime block', () => {
  const md = parseMetadata(WITH_RUNTIME)
  assert.equal(md.valid, true)
  assert.equal(md.runtime.activePlan, 'PLAN-003')
  assert.deepEqual(md.runtime.gateAttempts, { develop: 2, verify: 1 })
  assert.deepEqual(md.runtime.clarifierRounds, { code_author: 1 })
  assert.deepEqual(md.runtime.gateLog, [
    '2026-07-01 develop code_reviewer FAIL -- 3 blockers',
    '2026-07-02 develop code_reviewer PASS',
  ])
})

test('parseMetadata defaults runtime to empty on legacy files without the block', () => {
  assert.deepEqual(parseMetadata(SAMPLE).runtime, EMPTY_RUNTIME)
})

test('a runtime block does not disturb phase/agent parsing', () => {
  const md = parseMetadata(WITH_RUNTIME)
  assert.equal(md.phases.develop.status, 'in_progress')
  assert.deepEqual(md.phases.develop.agents, [{ name: 'code_author', status: 'pending' }])
  // runtime subkeys must never leak into the phase map
  assert.deepEqual(Object.keys(md.phases), ['develop', 'verify'])
})

test('computeState surfaces runtime and derives verifyCycle = verify strikes + 1', () => {
  const s = computeState({ hasMetadata: true, metadataContent: WITH_RUNTIME, hasCode: true })
  assert.equal(s.runtime.activePlan, 'PLAN-003')
  assert.equal(s.runtime.gateAttempts.develop, 2)
  assert.equal(s.verifyCycle, 2)
})

test('computeState defaults runtime + verifyCycle 1 when metadata is absent or legacy', () => {
  const fresh = computeState({ hasMetadata: false, metadataContent: '', hasCode: false })
  assert.deepEqual(fresh.runtime, EMPTY_RUNTIME)
  assert.equal(fresh.verifyCycle, 1)
  const legacy = computeState({ hasMetadata: true, metadataContent: SAMPLE, hasCode: true })
  assert.deepEqual(legacy.runtime, EMPTY_RUNTIME)
  assert.equal(legacy.verifyCycle, 1)
})

// ── recordGateVerdict: the script owns strike semantics, the orchestrator just reports ──

import { recordGateVerdict, VERDICTS } from '../scripts/sdlc-state.mjs'

test('recordGateVerdict FAIL increments the phase strike counter and appends to the log', () => {
  const r1 = recordGateVerdict(MIDWAY, { phase: 'develop', gate: 'code_reviewer', verdict: 'FAIL', note: '3 blockers', date: '2026-07-02' })
  assert.equal(r1.strikes, 1)
  const r2 = recordGateVerdict(r1.content, { phase: 'develop', gate: 'code_reviewer', verdict: 'FAIL', date: '2026-07-03' })
  assert.equal(r2.strikes, 2)
  const rt = parseMetadata(r2.content).runtime
  assert.deepEqual(rt.gateAttempts, { develop: 2 })
  assert.deepEqual(rt.gateLog, [
    '2026-07-02 develop code_reviewer FAIL -- 3 blockers',
    '2026-07-03 develop code_reviewer FAIL',
  ])
})

test('recordGateVerdict PASS resets strikes but keeps the log as history', () => {
  const fail = recordGateVerdict(MIDWAY, { phase: 'develop', gate: 'code_reviewer', verdict: 'FAIL', date: '2026-07-02' })
  const pass = recordGateVerdict(fail.content, { phase: 'develop', gate: 'code_reviewer', verdict: 'PASS', date: '2026-07-03' })
  assert.equal(pass.strikes, 0)
  const md = parseMetadata(pass.content)
  assert.equal(md.valid, true)
  assert.deepEqual(md.runtime.gateAttempts, {})
  assert.equal(md.runtime.gateLog.length, 2)
  assert.match(md.runtime.gateLog[1], /PASS$/)
  assert.equal(md.phases.develop.status, 'in_progress') // phase statuses untouched
})

test('recordGateVerdict WAIVED resets strikes like PASS and records the human outcome', () => {
  const r = recordGateVerdict(WITH_RUNTIME, { phase: 'verify', gate: 'validation_reviewer', verdict: 'WAIVED', note: 'perf NFR deferred by user', date: '2026-07-02' })
  assert.equal(r.strikes, 0)
  const rt = parseMetadata(r.content).runtime
  assert.equal(rt.gateAttempts.verify, undefined)
  assert.equal(rt.gateAttempts.develop, 2) // other phases' counters survive
  assert.equal(rt.gateLog.at(-1), '2026-07-02 verify validation_reviewer WAIVED -- perf NFR deferred by user')
})

test('recordGateVerdict on a develop PASS clears the clarifier rounds (the run is over)', () => {
  const r = recordGateVerdict(WITH_RUNTIME, { phase: 'develop', gate: 'code_reviewer', verdict: 'PASS', date: '2026-07-02' })
  const rt = parseMetadata(r.content).runtime
  assert.deepEqual(rt.clarifierRounds, {})
  assert.equal(rt.activePlan, 'PLAN-003') // the plan pointer survives for post-phase plan-add
})

test('recordGateVerdict verify FAILs drive computeState.verifyCycle', () => {
  const r = recordGateVerdict(WITH_RUNTIME, { phase: 'verify', gate: 'validation_reviewer', verdict: 'FAIL', note: 'REWORK REQUIRED', date: '2026-07-02' })
  assert.equal(r.strikes, 2) // WITH_RUNTIME already carries one verify strike
  const s = computeState({ hasMetadata: true, metadataContent: r.content, hasCode: true })
  assert.equal(s.verifyCycle, 3)
})

test('recordGateVerdict rejects unknown phases and verdicts', () => {
  assert.deepEqual(VERDICTS, ['PASS', 'FAIL', 'WAIVED'])
  assert.equal(recordGateVerdict(MIDWAY, { phase: 'ship', gate: 'g', verdict: 'PASS', date: '2026-07-02' }), null)
  assert.equal(recordGateVerdict(MIDWAY, { phase: 'develop', gate: 'g', verdict: 'MAYBE', date: '2026-07-02' }), null)
})

test('recordGateVerdict escapes quotes in notes and round-trips through the parser', () => {
  const r = recordGateVerdict(MIDWAY, { phase: 'define', gate: 'requirement_reviewer', verdict: 'FAIL', note: 'FR-003 "export" ambiguous', date: '2026-07-02' })
  const md = parseMetadata(r.content)
  assert.equal(md.valid, true)
  assert.equal(md.runtime.gateLog[0], '2026-07-02 define requirement_reviewer FAIL -- FR-003 "export" ambiguous')
})

// ── setActivePlan / bumpClarifierRound / resetLoop: the rest of the loop state ──

import { setActivePlan, bumpClarifierRound, resetLoop } from '../scripts/sdlc-state.mjs'

test('setActivePlan records the plan pointer and a SUPERSEDED re-record replaces it', () => {
  const a = setActivePlan(MIDWAY, 'PLAN-004')
  assert.equal(parseMetadata(a).runtime.activePlan, 'PLAN-004')
  const b = setActivePlan(a, 'PLAN-005') // clarifier reported SUPERSEDED: PLAN-004 → PLAN-005
  const md = parseMetadata(b)
  assert.equal(md.runtime.activePlan, 'PLAN-005')
  assert.equal(md.valid, true)
  assert.equal((b.match(/active_plan:/g) || []).length, 1) // replaced, never duplicated
})

test('bumpClarifierRound counts per author and reports the new round', () => {
  const r1 = bumpClarifierRound(MIDWAY, 'code_author')
  assert.equal(r1.rounds, 1)
  const r2 = bumpClarifierRound(r1.content, 'code_author')
  assert.equal(r2.rounds, 2)
  const r3 = bumpClarifierRound(r2.content, 'test_author')
  assert.equal(r3.rounds, 1) // per author — the bound is "the SAME author still blocked"
  assert.deepEqual(parseMetadata(r3.content).runtime.clarifierRounds, { code_author: 2, test_author: 1 })
})

test('resetLoop zeroes one phase bound (the escalation guidance outcome), keeping history', () => {
  const out = resetLoop(WITH_RUNTIME, 'develop')
  const rt = parseMetadata(out).runtime
  assert.equal(rt.gateAttempts.develop, undefined)
  assert.equal(rt.gateAttempts.verify, 1) // other bounds untouched
  assert.deepEqual(rt.clarifierRounds, {}) // develop's reset covers the authoring loop too
  assert.equal(rt.activePlan, 'PLAN-003') // guidance resumes the same plan
  assert.equal(rt.gateLog.length, 2) // the audit trail is history — never erased
  assert.equal(resetLoop(WITH_RUNTIME, 'nope'), null)
})

test('recordCycle clears the loop counters for the phases it resets, keeping the log', () => {
  let y = allCompleted()
  y = recordGateVerdict(y, { phase: 'define', gate: 'requirement_reviewer', verdict: 'FAIL', date: '2026-07-01' }).content
  y = recordGateVerdict(y, { phase: 'develop', gate: 'code_reviewer', verdict: 'FAIL', date: '2026-07-01' }).content
  y = recordGateVerdict(y, { phase: 'verify', gate: 'validation_reviewer', verdict: 'FAIL', date: '2026-07-01' }).content
  y = setActivePlan(y, 'PLAN-007')
  y = bumpClarifierRound(y, 'code_author').content
  const out = recordCycle(y, { assessment: 'maintain', nextCycle: true, date: '2026-07-02' })
  const rt = parseMetadata(out).runtime
  assert.equal(rt.gateAttempts.develop, undefined) // maintain resets develop..operate
  assert.equal(rt.gateAttempts.verify, undefined)
  assert.equal(rt.gateAttempts.define, 1) // define is NOT reset by maintain
  assert.deepEqual(rt.clarifierRounds, {}) // develop's reset covers the authoring loop
  assert.equal(rt.activePlan, null) // the next cycle starts on a fresh plan pointer
  assert.equal(rt.gateLog.length, 3) // history survives the cycle boundary
  assert.equal(parseMetadata(out).valid, true)
})

test('CLI: gate-log records verdicts, reports strikes, and validates its inputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  const f1 = runCLI(dir, ['gate-log', '--phase', 'develop', '--gate', 'code_reviewer', '--verdict', 'FAIL', '--note', '2 blockers'])
  assert.equal(f1.json.ok, true)
  assert.equal(f1.json.strikes, 1)
  const f2 = runCLI(dir, ['gate-log', '--phase', 'develop', '--gate', 'code_reviewer', '--verdict', 'fail']) // agents shout, humans type — accept both
  assert.equal(f2.json.strikes, 2)
  assert.equal(runCLI(dir, ['gate-log', '--phase', 'develop', '--gate', 'code_reviewer', '--verdict', 'PASS']).json.strikes, 0)
  assert.equal(runCLI(dir, ['gate-log', '--phase', 'develop', '--gate', 'code_reviewer', '--verdict', 'MAYBE']).json.ok, false)
  assert.equal(runCLI(dir, ['gate-log', '--phase', 'ship', '--gate', 'g', '--verdict', 'PASS']).json.ok, false)
  assert.equal(runCLI(dir, ['gate-log', '--phase', 'develop', '--verdict', 'PASS']).json.ok, false) // --gate required
})

test('CLI: gate-log on verify reports the cycle, and detect restores it on resume', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  const f = runCLI(dir, ['gate-log', '--phase', 'verify', '--gate', 'validation_reviewer', '--verdict', 'FAIL', '--note', 'REWORK REQUIRED'])
  assert.equal(f.json.verify_cycle, 2) // the next Verify run is cycle 2
  const d = runCLI(dir, ['detect'])
  assert.equal(d.json.verifyCycle, 2)
  assert.equal(d.json.runtime.gateAttempts.verify, 1)
})

test('CLI: plan-active sets the pointer, clarifier-round counts, loop-reset clears the bound', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  assert.equal(runCLI(dir, ['plan-active', '--id', 'PLAN-001']).json.active_plan, 'PLAN-001')
  assert.equal(runCLI(dir, ['plan-active', '--id', 'PLAN 001']).json.ok, false)
  assert.equal(runCLI(dir, ['clarifier-round', '--author', 'code_author']).json.rounds, 1)
  assert.equal(runCLI(dir, ['clarifier-round', '--author', 'code_author']).json.rounds, 2)
  assert.equal(runCLI(dir, ['clarifier-round']).json.ok, false)
  runCLI(dir, ['gate-log', '--phase', 'develop', '--gate', 'code_reviewer', '--verdict', 'FAIL'])
  assert.equal(runCLI(dir, ['loop-reset', '--phase', 'develop']).json.ok, true)
  const d = runCLI(dir, ['detect'])
  assert.deepEqual(d.json.runtime.gateAttempts, {})
  assert.deepEqual(d.json.runtime.clarifierRounds, {})
  assert.equal(d.json.runtime.activePlan, 'PLAN-001') // guidance resumes the same plan
  assert.equal(runCLI(dir, ['loop-reset', '--phase', 'nope']).json.ok, false)
})
