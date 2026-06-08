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
    define:
      status: "completed"
    design:
      status: "completed"
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

test('initMetadata output round-trips through parseMetadata with full 34-agent roster', () => {
  const out = initMetadata(TEMPLATE, { name: 'rt', version: '2.0.0', mode: 'greenfield' })
  const md = parseMetadata(out)
  assert.equal(md.valid, true)
  assert.equal(md.project, 'rt')
  assert.equal(md.version, '2.0.0')
  const total = Object.values(md.phases).reduce((n, p) => n + p.agents.length, 0)
  assert.equal(total, 34, `expected 34 agents parsed, got ${total}`)
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
  assert.equal(md.phases.develop.agents.length, 6)
  assert.equal(md.phases.develop.agents[0].name, 'architect_planner')
})
