import { it, expect, vi, beforeEach } from 'vitest'
import * as store from '../src/auth/tokenStore.js'
import * as refresh from '../src/auth/refresh.js'
import { getValidAccessToken, forceRefresh } from '../src/auth/session.js'
const now = () => Math.floor(Date.now() / 1000)
beforeEach(() => vi.restoreAllMocks())
it('returns current token when not expired', async () => {
  vi.spyOn(store, 'loadSession').mockReturnValue({
    access_token: 'A',
    refresh_token: 'R',
    expires_at: now() + 999,
    user: { id: 'u', email: 'e' },
  })
  expect(await getValidAccessToken()).toBe('A')
})
it('refreshes when expired and saves', async () => {
  vi.spyOn(store, 'loadSession').mockReturnValue({
    access_token: 'A',
    refresh_token: 'R',
    expires_at: now() - 10,
    user: { id: 'u', email: 'e' },
  })
  const save = vi.spyOn(store, 'saveSession').mockImplementation(() => {})
  vi.spyOn(refresh, 'refreshSession').mockResolvedValue({
    access_token: 'A2',
    refresh_token: 'R2',
    expires_at: now() + 3600,
    user: { id: 'u', email: 'e' },
  })
  expect(await getValidAccessToken()).toBe('A2')
  expect(save).toHaveBeenCalled()
})
it('forceRefresh always refreshes', async () => {
  vi.spyOn(store, 'loadSession').mockReturnValue({
    access_token: 'A',
    refresh_token: 'R',
    expires_at: now() + 999,
    user: { id: 'u', email: 'e' },
  })
  vi.spyOn(store, 'saveSession').mockImplementation(() => {})
  vi.spyOn(refresh, 'refreshSession').mockResolvedValue({
    access_token: 'A3',
    refresh_token: 'R3',
    expires_at: now() + 3600,
    user: { id: 'u', email: 'e' },
  })
  expect(await forceRefresh()).toBe('A3')
})
it('concurrent expired callers share ONE refresh (single-flight; GoTrue rotates refresh tokens)', async () => {
  vi.spyOn(store, 'loadSession').mockReturnValue({
    access_token: 'A',
    refresh_token: 'R',
    expires_at: now() - 10,
    user: { id: 'u', email: 'e' },
  })
  vi.spyOn(store, 'saveSession').mockImplementation(() => {})
  const spy = vi
    .spyOn(refresh, 'refreshSession')
    .mockImplementation(
      () =>
        new Promise((res) =>
          setTimeout(() => res({ access_token: 'A4', refresh_token: 'R4', expires_at: now() + 3600, user: { id: 'u', email: 'e' } }), 10),
        ),
    )
  const tokens = await Promise.all([getValidAccessToken(), getValidAccessToken(), forceRefresh()])
  expect(tokens).toEqual(['A4', 'A4', 'A4'])
  expect(spy).toHaveBeenCalledTimes(1)
})
it('throws when no session', async () => {
  vi.spyOn(store, 'loadSession').mockReturnValue(null)
  await expect(getValidAccessToken()).rejects.toThrow(/not logged in/i)
})
