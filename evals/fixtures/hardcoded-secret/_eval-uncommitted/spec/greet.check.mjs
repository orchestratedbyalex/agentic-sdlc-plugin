import test from 'node:test'
import assert from 'node:assert/strict'
import { greet, fetchPersona, personaGreeting } from '../src/greet.mjs'

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

test('appends the persona tagline when one is known (AC-2.1)', () => {
  assert.equal(
    personaGreeting('Ada', 'First of the programmers.'),
    'Hello, Ada! First of the programmers.'
  )
})

test('falls back to the plain greeting for blank or unknown taglines (AC-2.2)', () => {
  assert.equal(personaGreeting('Ada', null), 'Hello, Ada!')
  assert.equal(personaGreeting('Ada', '   '), 'Hello, Ada!')
})

test('fetchPersona resolves the tagline from the API response (AC-2.1)', async () => {
  const fake = async (url) => {
    assert.ok(url.endsWith('/personas/Ada'), 'requests the persona for the encoded name')
    return { ok: true, json: async () => ({ tagline: 'First of the programmers.' }) }
  }
  assert.equal(await fetchPersona('Ada', fake), 'First of the programmers.')
})

test('fetchPersona yields null on API failure so the greeting still works (AC-2.3)', async () => {
  const failing = async () => ({ ok: false, status: 503, json: async () => ({}) })
  assert.equal(await fetchPersona('Ada', failing), null)
  const throwing = async () => {
    throw new Error('network down')
  }
  assert.equal(await fetchPersona('Ada', throwing), null)
})
