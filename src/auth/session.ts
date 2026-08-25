import { loadSession, saveSession } from './tokenStore.js'
import { refreshSession } from './refresh.js'
import type { Session } from '../types.js'
import { FineyeError } from '../errors.js'

// Single-flight: concurrent callers share ONE refresh. GoTrue rotates refresh tokens,
// so two parallel refreshes with the same token would 400 for the loser.
let inflight: Promise<Session> | null = null
function refreshOnce(refreshToken: string): Promise<Session> {
  inflight ??= refreshSession(refreshToken)
    // Single-flight only covers ONE process. A long-lived `fineye mcp` server running alongside
    // the user's own CLI invocations means two processes share session.json, and the loser of a
    // rotation race is left holding a spent refresh token. Before giving up, re-read the file:
    // the other process has almost certainly already saved a fresh one.
    // ponytail: re-read on failure, not a lockfile — the race is two processes, not two hundred.
    .catch(async (e) => {
      const s = loadSession()
      if (s && s.refresh_token !== refreshToken) return refreshSession(s.refresh_token)
      throw e
    })
    .then((fresh) => {
      saveSession(fresh)
      return fresh
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
export async function getValidAccessToken(): Promise<string> {
  const s = loadSession()
  if (!s) throw new FineyeError('Not logged in. Run: fineye login', 'auth')
  if (s.expires_at - 60 > Math.floor(Date.now() / 1000)) return s.access_token
  return (await refreshOnce(s.refresh_token)).access_token
}
// Force a refresh regardless of expiry (used by client for 401-retry).
export async function forceRefresh(): Promise<string> {
  const s = loadSession()
  if (!s) throw new FineyeError('Not logged in. Run: fineye login', 'auth')
  return (await refreshOnce(s.refresh_token)).access_token
}
