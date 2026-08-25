import { it, expect, vi } from 'vitest'
import { exchangeCode, buildAuthUrl } from '../src/auth/login.js'
it('exchanges pkce code for session', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u', email: 'e@x' } }), {
      status: 200,
    }),
  )
  const s = await exchangeCode('CODE', 'VERIFIER')
  expect(s.access_token).toBe('A')
  expect(s.user.email).toBe('e@x')
})
it('buildAuthUrl includes pkce + prompt', () => {
  const u = buildAuthUrl('CHAL')
  expect(u).toContain('provider=google')
  expect(u).toContain('code_challenge=CHAL')
  expect(u).toContain('code_challenge_method=s256')
  expect(u).toContain('prompt=select_account')
})
