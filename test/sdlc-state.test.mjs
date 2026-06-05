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
