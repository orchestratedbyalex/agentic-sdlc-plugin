// Pure logic for the agent eval harness. Zero-dependency Node ESM, like the other
// scripts in this repo. Everything here is model-free and unit-tested by
// test/evals-lib.test.mjs; the billed path (spawning `claude`) lives in run.mjs.
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// The machine-parsable gate verdict (design invariant: every gate report ends with a
// `VERDICT: PASS|FAIL` line — see CLAUDE.md invariant list and item 6). Agents sometimes
// decorate the line with markdown bold, and each phase keeps its own vocabulary in
// parentheses, so match line-anchored with optional `**` and take the LAST occurrence
// (the report's own Verdict section closes the message).
const VERDICT_RE = /^\s*(?:\*\*)?VERDICT:\s*(PASS|FAIL)\b/

export function extractVerdict(text) {
  if (typeof text !== 'string' || text === '') return null
  let found = null
  for (const rawLine of text.split('\n')) {
    const m = VERDICT_RE.exec(rawLine)
    if (m) found = { verdict: m[1], line: rawLine.trim() }
  }
  return found
}

function parseEvents(ndjson) {
  const events = []
  if (typeof ndjson !== 'string') return events
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // stream noise (partial line, stderr bleed) — skip, never abort the parse
    }
  }
  return events
}

// The Agent tool_result appends a harness block ("agentId: … <usage>…") after the
// subagent's message — it is plumbing, not the agent's report, so drop it.
const AGENT_METADATA_RE = /^agentId:\s/

// When the CLI runs the dispatch in the background, the tool_result is only a launch
// stub; the subagent's real final message arrives later in a task_notification event.
const ASYNC_STUB_RE = /^Async agent launched successfully/

// The subagent's final message is the ground truth an eval asserts on — extracted from
// the Agent/Task tool_result in the stream (or, for a background dispatch, from its
// completion notification), never from the top-level model's relay of it. Older CLIs
// name the dispatch tool Task; current ones name it Agent.
export function extractAgentResult(ndjson, subagentType) {
  const events = parseEvents(ndjson)
  let toolUseId = null
  for (const ev of events) {
    if (ev?.type !== 'assistant' || !Array.isArray(ev.message?.content)) continue
    for (const block of ev.message.content) {
      if (
        block?.type === 'tool_use' &&
        (block.name === 'Agent' || block.name === 'Task') &&
        block.input?.subagent_type === subagentType
      ) {
        toolUseId = block.id // last dispatch of this agent wins
      }
    }
  }
  if (!toolUseId) return null
  let fromToolResult = null
  for (const ev of events) {
    if (ev?.type !== 'user' || !Array.isArray(ev.message?.content)) continue
    for (const block of ev.message.content) {
      if (block?.type !== 'tool_result' || block.tool_use_id !== toolUseId) continue
      if (typeof block.content === 'string') {
        fromToolResult = block.content
      } else {
        const texts = (Array.isArray(block.content) ? block.content : [])
          .filter((c) => c?.type === 'text' && typeof c.text === 'string' && !AGENT_METADATA_RE.test(c.text))
          .map((c) => c.text)
        fromToolResult = texts.join('\n\n')
      }
    }
  }
  if (fromToolResult && !ASYNC_STUB_RE.test(fromToolResult)) {
    return { toolUseId, text: fromToolResult, source: 'tool_result' }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (
      ev?.type === 'system' &&
      ev.subtype === 'task_notification' &&
      ev.tool_use_id === toolUseId &&
      ev.status === 'completed' &&
      typeof ev.summary === 'string'
    ) {
      return { toolUseId, text: ev.summary, source: 'notification' }
    }
  }
  return null
}

// Assert a case's labelled expectation against the agent's report. Labels are
// mechanical on purpose: the expected VERDICT plus regex patterns (compiled
// case-insensitive) — never an LLM judging an LLM.
export function evaluateCase(caseDef, reportText) {
  if (typeof reportText !== 'string' || reportText === '') {
    return { pass: false, verdict: null, failures: ['no report extracted from the transcript'] }
  }
  const failures = []
  const found = extractVerdict(reportText)
  if (!found) {
    failures.push('no VERDICT line in the report (every gate report must end with one)')
  } else if (found.verdict !== caseDef.expect.verdict) {
    failures.push(`expected VERDICT: ${caseDef.expect.verdict}, got "${found.line}"`)
  }
  for (const pattern of caseDef.expect.mustMatch ?? []) {
    if (!new RegExp(pattern, 'i').test(reportText)) failures.push(`report does not match required pattern /${pattern}/i`)
  }
  for (const pattern of caseDef.expect.mustNotMatch ?? []) {
    if (new RegExp(pattern, 'i').test(reportText)) failures.push(`report matches forbidden pattern /${pattern}/i`)
  }
  return { pass: failures.length === 0, verdict: found ? found.verdict : null, failures }
}

// One tool list for every case in slice 1: the dispatch plumbing (Agent, plus
// ToolSearch because the CLI defers the Agent tool, plus Task for older CLIs) and the
// reviewer read-only grant (design invariant: reviewers get Read Grep Glob Bash only).
// Extending the matrix to author agents means widening this per case — deliberately.
const ALLOWED_TOOLS = 'Agent,ToolSearch,Task,Read,Grep,Glob,Bash'

const DEFAULT_INNER_PROMPT = 'Execute your task in the current repository (the working directory).'

export function buildClaudeArgs(caseDef, { pluginDir, model, maxTurns = 40 }) {
  const subagentType = `agentic-sdlc:${caseDef.agent}`
  const inner = caseDef.prompt ?? DEFAULT_INNER_PROMPT
  const prompt =
    `Dispatch ONE subagent using the Agent tool (load it via ToolSearch first if it is deferred; ` +
    `older CLIs name it Task) with subagent_type "${subagentType}" and this exact prompt: "${inner}" ` +
    `When the subagent returns, reply with its final message verbatim and nothing else. ` +
    `Do not run any analysis yourself — the subagent does the work.`
  const args = [
    '-p', prompt,
    '--plugin-dir', pluginDir,
    '--allowedTools', ALLOWED_TOOLS,
    '--output-format', 'stream-json',
    '--verbose',
    '--max-turns', String(maxTurns),
  ]
  if (model) args.push('--model', model)
  return args
}

// Fixtures are checked into the plugin repo and therefore carry no .git of their own;
// each eval run gets a disposable work tree with a deterministic baseline commit
// (isolated from the contributor's git config so signing/hooks can't interfere).
// A fixture may ship an `_eval-uncommitted/` overlay: those files are applied AFTER
// the baseline commit, as the uncommitted diff — that is how diff-reviewing agents
// (e.g. the Develop code reviewer) get "the change under review".
export function prepareFixture(fixtureDir, workDir) {
  if (!existsSync(fixtureDir)) throw new Error(`fixture dir not found: ${fixtureDir}`)
  mkdirSync(workDir, { recursive: true })
  cpSync(fixtureDir, workDir, { recursive: true })

  const overlay = join(workDir, '_eval-uncommitted')
  const overlayAside = `${workDir}.uncommitted`
  if (existsSync(overlay)) renameSync(overlay, overlayAside)

  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
  const git = (...args) => execFileSync('git', args, { cwd: workDir, env, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=sdlc-eval', '-c', 'user.email=eval@localhost', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture baseline')

  if (existsSync(overlayAside)) {
    cpSync(overlayAside, workDir, { recursive: true, force: true })
    rmSync(overlayAside, { recursive: true, force: true })
  }
  return { workDir }
}

export function extractRunMeta(ndjson) {
  const events = parseEvents(ndjson)
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev?.type !== 'result') continue
    return {
      costUsd: ev.total_cost_usd ?? null,
      durationMs: ev.duration_ms ?? null,
      numTurns: ev.num_turns ?? null,
      isError: Boolean(ev.is_error),
      resultText: typeof ev.result === 'string' ? ev.result : null,
    }
  }
  return null
}
