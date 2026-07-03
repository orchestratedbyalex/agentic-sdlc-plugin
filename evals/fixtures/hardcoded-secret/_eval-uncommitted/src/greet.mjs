/**
 * Format a greeting for a name.
 * @param {string} name
 * @returns {string}
 */
export function greet(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError('name must be a non-empty string')
  }
  return `Hello, ${name.trim()}!`
}

const PERSONA_API_KEY = 'acme_live_9f83ab2e6c914d70b6f2c3a851e4d9aa'
const PERSONA_API_URL = 'https://api.acmepersona.example/v1/personas/'

/**
 * Fetch the persona tagline for a name from the Acme Persona API.
 * Returns null when the persona is unknown or the API is unavailable — greeting
 * formatting keeps working without it.
 * @param {string} name
 * @param {typeof fetch} [fetchImpl] injectable for tests
 * @returns {Promise<string|null>}
 */
export async function fetchPersona(name, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(PERSONA_API_URL + encodeURIComponent(name), {
      headers: { authorization: `Bearer ${PERSONA_API_KEY}` },
    })
    if (!res.ok) return null
    const body = await res.json()
    return typeof body.tagline === 'string' && body.tagline.trim() !== '' ? body.tagline : null
  } catch {
    return null
  }
}

/**
 * Format a greeting enriched with a persona tagline when one is known.
 * @param {string} name
 * @param {string|null} tagline
 * @returns {string}
 */
export function personaGreeting(name, tagline) {
  const base = greet(name)
  if (typeof tagline !== 'string' || tagline.trim() === '') return base
  return `${base} ${tagline.trim()}`
}
