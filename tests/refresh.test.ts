import { it, expect, vi } from 'vitest'
import { refreshSession } from '../src/auth/refresh.js'
it('exchanges refresh_token for a new session', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ access_token: 'A2', refresh_token: 'R2', expires_in: 3600, user: { id: 'u', email: 'e@x' } }), {
      status: 200,
    }),
  )
  const s = await refreshSession('R1')
  expect(s.access_token).toBe('A2')
  expect(s.refresh_token).toBe('R2')
  expect(s.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000))
})
