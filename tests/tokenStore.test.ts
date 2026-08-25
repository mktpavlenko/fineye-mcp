import { describe, it, expect, beforeEach } from 'vitest'
import { saveSession, loadSession, clearSession, sessionFile } from '../src/auth/tokenStore.js'
import { statSync, rmSync } from 'node:fs'
const s = { access_token: 'a', refresh_token: 'r', expires_at: 123, user: { id: 'u', email: 'e@x' } }
describe('tokenStore', () => {
  beforeEach(() => {
    try {
      rmSync(sessionFile(), { force: true })
    } catch {
      // no leftover dir from a previous run
    }
  })
  it('round-trips session and chmods 600', () => {
    expect(loadSession()).toBeNull()
    saveSession(s)
    expect(loadSession()).toEqual(s)
    expect(statSync(sessionFile()).mode & 0o777).toBe(0o600)
    clearSession()
    expect(loadSession()).toBeNull()
  })
})
