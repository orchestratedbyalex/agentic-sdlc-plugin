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

// ── CLI integration: the `complete` command's guards (run the real script) ──

import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
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

test('CLI: setupComplete only after every setup phase AND its agents complete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cli-'))
  runCLI(dir, ['init', '--name', 'x', '--version', '0.1.0', '--mode', 'existing'])
  // completing one agent of prepare must NOT unlock setup
  assert.equal(runCLI(dir, ['complete', '--phase', 'prepare', '--agent', 'explorer']).json.setupComplete, false)
  runCLI(dir, ['complete', '--phase', 'prepare'])
  runCLI(dir, ['complete', '--phase', 'define'])
  assert.equal(runCLI(dir, ['complete', '--phase', 'design']).json.setupComplete, true)
})
