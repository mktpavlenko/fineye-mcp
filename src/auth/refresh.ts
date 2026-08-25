import { SUPABASE_URL, ANON_KEY } from '../constants.js'
import type { Session } from '../types.js'
import { FineyeError } from '../errors.js'
export async function refreshSession(refreshToken: string): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) throw new FineyeError(`refresh failed: ${res.status} ${await res.text()} — run: fineye login`, 'auth')
  const d = (await res.json()) as any
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
    user: { id: d.user.id, email: d.user.email },
  }
}
