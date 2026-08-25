import { it, expect, vi } from 'vitest'
import { sendOtp, verifyOtp } from '../src/auth/otp.js'
it('sends otp then verifies to a session', async () => {
  const f = vi.spyOn(globalThis, 'fetch')
  f.mockResolvedValueOnce(new Response('{}', { status: 200 }))
  await sendOtp('e@x')
  expect(String(f.mock.calls[0][0])).toContain('/auth/v1/otp')
  f.mockResolvedValueOnce(
    new Response(JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u', email: 'e@x' } }), {
      status: 200,
    }),
  )
  const s = await verifyOtp('e@x', '123456')
  expect(s.access_token).toBe('A')
})
