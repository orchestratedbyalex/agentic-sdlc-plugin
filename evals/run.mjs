#!/usr/bin/env node
// Eval runner for the plugin's own agents. BILLED: each case spawns a headless
// `claude -p --plugin-dir <this repo>` session that dispatches the real subagent on a
// labelled fixture and asserts on its VERDICT line. Because real models are invoked,
// this NEVER runs under `node --test` — it is opt-in behind SDLC_EVALS=1:
//
//   SDLC_EVALS=1 node evals/run.mjs                 # run every case
//   SDLC_EVALS=1 node evals/run.mjs --case <id>     # one case (repeatable / comma-separated)
//   SDLC_EVALS=1 node evals/run.mjs --model sonnet  # route the run to a specific model
//   node evals/run.mjs --list                       # list cases (free, no model calls)
//
// Transcripts, extracted reports, and per-case metadata land in evals/results/<stamp>/.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { CASES } from './cases.mjs'
import { buildClaudeArgs, extractAgentResult, extractRunMeta, evaluateCase, prepareFixture } from './lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const opts = { cases: [], model: null, maxTurns: 40, timeoutSec: 600, keep: false, list: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--case') opts.cases.push(...String(argv[++i] ?? '').split(',').filter(Boolean))
    else if (a === '--model') opts.model = argv[++i]
    else if (a === '--max-turns') opts.maxTurns = Number(argv[++i])
    else if (a === '--timeout') opts.timeoutSec = Number(argv[++i])
    else if (a === '--keep') opts.keep = true
    else if (a === '--list') opts.list = true
    else {
      console.error(`unknown flag: ${a}`)
      process.exit(2)
    }
  }
  return opts
}

const opts = parseArgs(process.argv.slice(2))

if (opts.list) {
  for (const c of CASES) console.log(`${c.id}\n    agent: ${c.agent}  fixture: ${c.fixture}  expect: VERDICT: ${c.expect.verdict}\n    ${c.note}`)
  process.exit(0)
}

if (process.env.SDLC_EVALS !== '1') {
  console.error('These evals invoke real models through the `claude` CLI and are billed to your account.')
  console.error('Opt in explicitly:')
  console.error('  SDLC_EVALS=1 node evals/run.mjs [--case <id>] [--model <model>] [--keep]')
  console.error('List cases without running anything:  node evals/run.mjs --list')
  process.exit(2)
}

const selected = opts.cases.length ? CASES.filter((c) => opts.cases.includes(c.id)) : CASES
if (opts.cases.length && selected.length !== opts.cases.length) {
  const known = new Set(CASES.map((c) => c.id))
  console.error(`unknown case id(s): ${opts.cases.filter((id) => !known.has(id)).join(', ')} (see --list)`)
  process.exit(2)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const resultsDir = join(ROOT, 'evals', 'results', stamp)
mkdirSync(resultsDir, { recursive: true })

let failed = 0
const summary = []
for (const caseDef of selected) {
  const caseDir = join(resultsDir, caseDef.id)
  mkdirSync(caseDir, { recursive: true })
  const workBase = mkdtempSync(join(tmpdir(), `sdlc-eval-${caseDef.id}-`))
  const workDir = join(workBase, 'repo')
  prepareFixture(join(ROOT, 'evals', 'fixtures', caseDef.fixture), workDir)

  console.log(`\n▶ ${caseDef.id} — ${caseDef.note}`)
  const args = buildClaudeArgs(caseDef, { pluginDir: ROOT, model: opts.model, maxTurns: opts.maxTurns })
  const run = spawnSync('claude', args, {
    cwd: workDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeoutSec * 1000,
    maxBuffer: 128 * 1024 * 1024,
  })

  const transcript = run.stdout ?? ''
  writeFileSync(join(caseDir, 'transcript.ndjson'), transcript)
  if (run.stderr) writeFileSync(join(caseDir, 'stderr.log'), run.stderr)

  const agentResult = extractAgentResult(transcript, `agentic-sdlc:${caseDef.agent}`)
  const runMeta = extractRunMeta(transcript)
  // ground truth is the subagent's tool_result; the top-level relay is only a fallback
  const reportText = agentResult?.text ?? runMeta?.resultText ?? null
  const reportSource = agentResult?.source ?? (runMeta?.resultText ? 'relay' : null)
  if (reportText) writeFileSync(join(caseDir, 'report.md'), reportText)

  const evaluation = evaluateCase(caseDef, reportText)
  if (run.error) evaluation.failures.push(`claude run errored: ${run.error.message}`)
  if (run.status !== 0 && run.status !== null) evaluation.failures.push(`claude exited ${run.status}`)
  // surface the CLI's own error (rate limit, session limit, auth) instead of a bare exit code
  if (runMeta?.isError && runMeta.resultText) evaluation.failures.push(`claude reported: ${runMeta.resultText}`)
  const pass = evaluation.failures.length === 0

  const meta = {
    id: caseDef.id,
    pass,
    expectVerdict: caseDef.expect.verdict,
    gotVerdict: evaluation.verdict,
    failures: evaluation.failures,
    reportSource,
    model: opts.model ?? 'cli default',
    costUsd: runMeta?.costUsd ?? null,
    durationMs: runMeta?.durationMs ?? null,
    numTurns: runMeta?.numTurns ?? null,
    workDir: opts.keep ? workDir : null,
  }
  writeFileSync(join(caseDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

  const cost = meta.costUsd != null ? `$${meta.costUsd.toFixed(4)}` : 'cost n/a'
  const secs = meta.durationMs != null ? `${Math.round(meta.durationMs / 1000)}s` : ''
  if (pass) {
    console.log(`  ✅ VERDICT: ${evaluation.verdict} (as labelled) — ${cost} ${secs}`)
  } else {
    failed++
    console.log(`  ❌ expected VERDICT: ${caseDef.expect.verdict}, got ${evaluation.verdict ?? 'none'} — ${cost} ${secs}`)
    for (const f of evaluation.failures) console.log(`     - ${f}`)
  }
  summary.push(meta)

  if (opts.keep) console.log(`  workdir kept: ${workDir}`)
  else rmSync(workBase, { recursive: true, force: true })
}

writeFileSync(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
const total = summary.reduce((s, m) => s + (m.costUsd ?? 0), 0)
console.log(`\n${selected.length - failed}/${selected.length} evals passed — total cost $${total.toFixed(4)} — results in ${resultsDir}`)
process.exit(failed === 0 ? 0 : 1)
