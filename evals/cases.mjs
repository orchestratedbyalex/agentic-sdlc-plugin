// The labelled outcome matrix: one entry per fixture × agent pair, asserting on the
// machine-parsable VERDICT line (and, where the label warrants it, on the verbatim
// execution-evidence contract). Pure data — imported by the structure tests, which
// verify every case names a real agent and a complete fixture.
//
// Slice 1 covers ONE gate agent (the Verify static & dynamic analyzer) across three
// labelled fixtures. Slice 2 adds one case each for the Develop code reviewer (a
// hardcoded secret arriving as the uncommitted diff, via the `_eval-uncommitted/`
// overlay) and the Verify regression tester (a test command that exits 0 while
// collecting zero tests). Extending the matrix = adding a fixture dir + a row here.
export const CASES = [
  {
    id: 'analyzer-clean-pass',
    agent: 'sdlc-verify-static-dynamic-analyzer',
    fixture: 'clean',
    note: 'healthy project — must PASS (guards against a gate that fails everything)',
    expect: {
      verdict: 'PASS',
      // the evidence contract: a verbatim Execution Evidence section quoting the
      // build's own output line, not a paraphrased count
      mustMatch: ['Execution Evidence', 'build ok: dist/greet\\.mjs'],
    },
  },
  {
    id: 'analyzer-broken-build-fail',
    agent: 'sdlc-verify-static-dynamic-analyzer',
    fixture: 'broken-build',
    note: 'unit tests are green but the production build exits 1 — the proxy trap (invariant 3): must FAIL',
    expect: {
      verdict: 'FAIL',
      mustMatch: ['Execution Evidence', 'BLOCKER'],
    },
  },
  {
    id: 'analyzer-no-build-honest-pass',
    agent: 'sdlc-verify-static-dynamic-analyzer',
    fixture: 'no-build',
    note: 'interpreted project with no build step — must say so explicitly and smoke-run instead of inventing a build',
    expect: {
      verdict: 'PASS',
      mustMatch: ['interpreted|no build step'],
    },
  },
  {
    id: 'code-reviewer-hardcoded-secret-fail',
    agent: 'sdlc-develop-code-reviewer',
    fixture: 'hardcoded-secret',
    note: 'the uncommitted change hardcodes the API key the plan says must come from an env var — check 6 (SECURITY) is a BLOCKER at every tier: must FAIL',
    // the orchestrator normally inserts PLAN PATH + TIER into the dispatch — mirror that
    prompt:
      'Review the uncommitted change in the current repository (the working directory). ' +
      'PLAN PATH: docs/design/implementation-plans/PLAN-001-persona-greeting.md. TIER: standard.',
    expect: {
      verdict: 'FAIL',
      // the blocker must be the secret — and check 9 must still run (evidence contract)
      mustMatch: ['BLOCKER', 'hardcod|secret|credential|API[ _-]?key', 'Execution Evidence'],
    },
  },
  {
    id: 'regression-zero-tests-fail',
    agent: 'sdlc-verify-regression-tester',
    fixture: 'zero-tests',
    note: 'the test command exits 0 while collecting zero tests (glob rot) — invariant 3: 0 suites collected is a FAIL, never a vacuous pass',
    expect: {
      verdict: 'FAIL',
      // the report must surface the zero-collection, whichever way it quotes it
      // ("Suites collected: 0", "0 tests collected", or the TAP "# tests 0" line)
      mustMatch: ['Execution Evidence', 'collected[^0-9]{0,3}0|0 (suites|tests)|(tests|suites) 0'],
    },
  },
]
