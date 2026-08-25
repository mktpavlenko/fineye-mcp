import { describe, it, expect } from 'vitest'
import { createPkce } from '../src/auth/pkce.js'
import { createHash } from 'node:crypto'
describe('pkce', () => {
  it('challenge = base64url(sha256(verifier))', () => {
    const { verifier, challenge } = createPkce()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })
})
