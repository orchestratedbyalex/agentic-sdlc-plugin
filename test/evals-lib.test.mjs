// Unit tests for the eval harness's pure logic (evals/lib.mjs).
// These are model-free and fast — the billed path (spawning `claude`) lives only in
// evals/run.mjs and is exercised by the opt-in eval command, never by `node --test`.
import test from 'node:test'
import assert from 'node:assert/strict'

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

import { extractVerdict, extractAgentResult, extractRunMeta, evaluateCase, buildClaudeArgs, prepareFixture } from '../evals/lib.mjs'

const ANALYZER = 'agentic-sdlc:sdlc-verify-static-dynamic-analyzer'

function dispatchEvent(id, subagentType, name = 'Agent') {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input: { subagent_type: subagentType, description: 'x', prompt: 'Execute your task.' } }] },
  })
}

function resultForDispatch(id, blocks) {
  return JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: blocks }] },
  })
}

const REPORT = '## Static & Dynamic Analysis Report\n\n### Verdict\nVERDICT: PASS — analysis clean'
const METADATA_BLOCK = "agentId: a2645951 (use SendMessage with to: 'a2645951' to continue this agent)\n<usage>subagent_tokens: 9000</usage>"

test('extractVerdict parses a plain verdict line', () => {
  const report = '## Report\n\n### Verdict\nVERDICT: PASS — analysis clean\n'
  assert.deepEqual(extractVerdict(report), {
    verdict: 'PASS',
    line: 'VERDICT: PASS — analysis clean',
  })
})

test('extractVerdict tolerates markdown bold and per-phase vocabulary', () => {
  assert.equal(extractVerdict('**VERDICT: FAIL** — 2 blockers').verdict, 'FAIL')
  assert.equal(extractVerdict('VERDICT: FAIL (CHANGES REQUESTED) — route to CodeAuthor').verdict, 'FAIL')
  assert.equal(extractVerdict('  **VERDICT: PASS (APPROVED)** — ready').verdict, 'PASS')
})

test('extractVerdict takes the LAST verdict line when several appear', () => {
  const report = 'The template says:\nVERDICT: PASS — analysis clean\n\n### Verdict\nVERDICT: FAIL — build broke\n'
  assert.equal(extractVerdict(report).verdict, 'FAIL')
})

test('extractVerdict is line-anchored and null-safe', () => {
  assert.equal(extractVerdict('the orchestrator keys off the VERDICT: PASS line'), null)
  assert.equal(extractVerdict('no verdict here'), null)
  assert.equal(extractVerdict(''), null)
  assert.equal(extractVerdict(null), null)
})

test('extractAgentResult returns the subagent final message, dropping the agentId metadata block', () => {
  const ndjson = [
    dispatchEvent('tu1', ANALYZER),
    resultForDispatch('tu1', [
      { type: 'text', text: REPORT },
      { type: 'text', text: METADATA_BLOCK },
    ]),
  ].join('\n')
  assert.deepEqual(extractAgentResult(ndjson, ANALYZER), { toolUseId: 'tu1', text: REPORT, source: 'tool_result' })
})

const ASYNC_STUB =
  'Async agent launched successfully. (This tool result is internal metadata — never quote it.)\n' +
  "agentId: ae19c9f0 (internal ID - do not mention to user.)\n" +
  'The agent is working in the background. You will be notified automatically when it completes.'

test('extractAgentResult skips the async-launch stub and reads the completion notification', () => {
  const ndjson = [
    dispatchEvent('tu1', ANALYZER),
    resultForDispatch('tu1', [{ type: 'text', text: ASYNC_STUB }]),
    JSON.stringify({ type: 'system', subtype: 'task_notification', tool_use_id: 'tu1', status: 'completed', summary: REPORT }),
  ].join('\n')
  assert.deepEqual(extractAgentResult(ndjson, ANALYZER), { toolUseId: 'tu1', text: REPORT, source: 'notification' })
})

test('extractAgentResult returns null for an async launch that never completed', () => {
  const ndjson = [
    dispatchEvent('tu1', ANALYZER),
    resultForDispatch('tu1', [{ type: 'text', text: ASYNC_STUB }]),
  ].join('\n')
  assert.equal(extractAgentResult(ndjson, ANALYZER), null)
})

test('extractAgentResult returns null when the named agent was never dispatched', () => {
  const ndjson = [
    dispatchEvent('tu1', 'agentic-sdlc:sdlc-develop-code-reviewer'),
    resultForDispatch('tu1', [{ type: 'text', text: REPORT }]),
  ].join('\n')
  assert.equal(extractAgentResult(ndjson, ANALYZER), null)
})

test('extractAgentResult accepts the Task tool name and skips unparseable lines', () => {
  const ndjson = [
    'not json at all {',
    dispatchEvent('tu9', ANALYZER, 'Task'),
    resultForDispatch('tu9', [{ type: 'text', text: REPORT }]),
    '',
  ].join('\n')
  assert.equal(extractAgentResult(ndjson, ANALYZER).text, REPORT)
})

test('extractAgentResult takes the LAST dispatch of the agent and joins its text blocks', () => {
  const ndjson = [
    dispatchEvent('tu1', ANALYZER),
    resultForDispatch('tu1', [{ type: 'text', text: 'first run — missing VERDICT line' }]),
    dispatchEvent('tu2', ANALYZER),
    resultForDispatch('tu2', [
      { type: 'text', text: '## Part one' },
      { type: 'text', text: 'VERDICT: FAIL — build broke' },
    ]),
  ].join('\n')
  assert.deepEqual(extractAgentResult(ndjson, ANALYZER), {
    toolUseId: 'tu2',
    text: '## Part one\n\nVERDICT: FAIL — build broke',
    source: 'tool_result',
  })
})

test('extractAgentResult tolerates a plain-string tool_result content', () => {
  const ndjson = [
    dispatchEvent('tu1', ANALYZER),
    JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: REPORT }] },
    }),
  ].join('\n')
  assert.equal(extractAgentResult(ndjson, ANALYZER).text, REPORT)
})

test('extractRunMeta reads cost and duration from the result event', () => {
  const ndjson = [
    dispatchEvent('tu1', ANALYZER),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, duration_ms: 78231, total_cost_usd: 0.0935, result: 'relay' }),
  ].join('\n')
  assert.deepEqual(extractRunMeta(ndjson), {
    costUsd: 0.0935,
    durationMs: 78231,
    numTurns: 3,
    isError: false,
    resultText: 'relay',
  })
})

test('extractRunMeta is null when no result event exists', () => {
  assert.equal(extractRunMeta(dispatchEvent('tu1', ANALYZER)), null)
  assert.equal(extractRunMeta('garbage'), null)
})

const CLEAN_CASE = {
  id: 'analyzer-clean-pass',
  agent: 'sdlc-verify-static-dynamic-analyzer',
  fixture: 'clean',
  expect: {
    verdict: 'PASS',
    mustMatch: ['Execution Evidence', 'build ok: dist/greet\\.mjs'],
    mustNotMatch: ['BLOCKER'],
  },
}

test('evaluateCase passes when verdict and every pattern agree', () => {
  const report = '## Report\n### Execution Evidence\n```\nbuild ok: dist/greet.mjs (303 bytes)\n```\nVERDICT: PASS — analysis clean'
  assert.deepEqual(evaluateCase(CLEAN_CASE, report), { pass: true, verdict: 'PASS', failures: [] })
})

test('evaluateCase fails on a wrong verdict, naming expected vs actual', () => {
  const result = evaluateCase(CLEAN_CASE, '### Execution Evidence\nbuild ok: dist/greet.mjs\nVERDICT: FAIL — surprise')
  assert.equal(result.pass, false)
  assert.equal(result.verdict, 'FAIL')
  assert.ok(result.failures.some((f) => f.includes('expected VERDICT: PASS') && f.includes('FAIL')))
})

test('evaluateCase fails when the report has no verdict line at all', () => {
  const result = evaluateCase(CLEAN_CASE, 'a report with no verdict')
  assert.equal(result.pass, false)
  assert.equal(result.verdict, null)
  assert.ok(result.failures.some((f) => /no VERDICT line/i.test(f)))
})

test('evaluateCase itemizes pattern failures (mustMatch miss, mustNotMatch hit)', () => {
  const report = 'BLOCKER: build exploded\nVERDICT: PASS — but no evidence section'
  const result = evaluateCase(CLEAN_CASE, report)
  assert.equal(result.pass, false)
  assert.ok(result.failures.some((f) => f.includes('Execution Evidence')))
  assert.ok(result.failures.some((f) => f.includes('BLOCKER')))
})

test('evaluateCase fails safe when no report was extracted', () => {
  const result = evaluateCase(CLEAN_CASE, null)
  assert.deepEqual(result, { pass: false, verdict: null, failures: ['no report extracted from the transcript'] })
})

function flagValue(args, flag) {
  const i = args.indexOf(flag)
  return i === -1 ? null : args[i + 1]
}

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

test('prepareFixture copies the tree and commits a clean baseline', () => {
  const src = tempDir('sdlc-eval-src-')
  const work = join(tempDir('sdlc-eval-work-'), 'wd')
  writeFileSync(join(src, 'README.md'), 'fixture\n')
  mkdirSync(join(src, 'src'))
  writeFileSync(join(src, 'src', 'app.mjs'), 'export const x = 1\n')

  prepareFixture(src, work)

  assert.equal(readFileSync(join(work, 'src', 'app.mjs'), 'utf8'), 'export const x = 1\n')
  assert.equal(git(work, 'status', '--porcelain'), '', 'baseline working tree is clean')
  assert.equal(git(work, 'rev-list', '--count', 'HEAD').trim(), '1', 'exactly one baseline commit')
})

test('prepareFixture applies _eval-uncommitted/ as an uncommitted diff on top of the baseline', () => {
  const src = tempDir('sdlc-eval-src-')
  const work = join(tempDir('sdlc-eval-work-'), 'wd')
  mkdirSync(join(src, 'src'))
  writeFileSync(join(src, 'src', 'app.mjs'), 'export const x = 1\n')
  mkdirSync(join(src, '_eval-uncommitted', 'src'), { recursive: true })
  writeFileSync(join(src, '_eval-uncommitted', 'src', 'app.mjs'), 'export const x = "sk-hardcoded"\n')

  prepareFixture(src, work)

  assert.equal(readFileSync(join(work, 'src', 'app.mjs'), 'utf8'), 'export const x = "sk-hardcoded"\n', 'overlay content is live in the tree')
  assert.equal(git(work, 'status', '--porcelain').trim(), 'M src/app.mjs', 'overlay shows up as the uncommitted diff')
  assert.equal(git(work, 'show', 'HEAD:src/app.mjs'), 'export const x = 1\n', 'baseline commit has the pre-change content')
  assert.equal(existsSync(join(work, '_eval-uncommitted')), false, 'the overlay dir itself never reaches the work tree')
})

test('prepareFixture rejects a missing fixture dir loudly', () => {
  assert.throws(() => prepareFixture(join(tmpdir(), 'sdlc-eval-does-not-exist'), join(tempDir('sdlc-eval-work-'), 'wd')))
})

test('buildClaudeArgs wires the headless dispatch (plugin dir, stream-json, read-only agent tools)', () => {
  const args = buildClaudeArgs(CLEAN_CASE, { pluginDir: '/plug' })
  assert.equal(args[0], '-p')
  const prompt = args[1]
  assert.ok(prompt.includes('agentic-sdlc:sdlc-verify-static-dynamic-analyzer'), 'prompt names the plugin-qualified subagent type')
  assert.ok(prompt.includes('Execute your task in the current repository'), 'prompt carries the default inner task')
  assert.ok(/verbatim/i.test(prompt), 'prompt demands a verbatim relay of the final message')
  assert.equal(flagValue(args, '--plugin-dir'), '/plug')
  assert.equal(flagValue(args, '--output-format'), 'stream-json')
  assert.ok(args.includes('--verbose'), 'stream-json requires --verbose in print mode')
  assert.equal(flagValue(args, '--max-turns'), '40')
  for (const tool of ['Agent', 'ToolSearch', 'Task', 'Read', 'Grep', 'Glob', 'Bash']) {
    assert.ok(flagValue(args, '--allowedTools').includes(tool), `allowedTools grants ${tool}`)
  }
})

test('buildClaudeArgs adds --model only when given, and honors a per-case inner prompt', () => {
  const plain = buildClaudeArgs(CLEAN_CASE, { pluginDir: '/plug' })
  assert.equal(plain.indexOf('--model'), -1)
  const routed = buildClaudeArgs(
    { ...CLEAN_CASE, prompt: 'PLAN PATH: docs/plans/PLAN-001.md — review the change.' },
    { pluginDir: '/plug', model: 'claude-haiku-4-5-20251001', maxTurns: 12 },
  )
  assert.equal(flagValue(routed, '--model'), 'claude-haiku-4-5-20251001')
  assert.equal(flagValue(routed, '--max-turns'), '12')
  assert.ok(routed[1].includes('PLAN PATH: docs/plans/PLAN-001.md'), 'per-case prompt reaches the dispatch prompt')
})
