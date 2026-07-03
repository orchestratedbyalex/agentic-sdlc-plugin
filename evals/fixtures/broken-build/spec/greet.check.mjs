import test from 'node:test'
import assert from 'node:assert/strict'
import { greet } from '../src/greet.mjs'

test('greets a name (AC-1.1)', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!')
})

test('trims surrounding whitespace (AC-1.2)', () => {
  assert.equal(greet('  Ada '), 'Hello, Ada!')
})

test('rejects empty or non-string names (AC-1.3)', () => {
  assert.throws(() => greet(''), TypeError)
  assert.throws(() => greet(42), TypeError)
})
