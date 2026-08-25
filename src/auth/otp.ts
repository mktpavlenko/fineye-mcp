import { SUPABASE_URL, ANON_KEY } from '../constants.js'
import type { Session } from '../types.js'
const H = { apikey: ANON_KEY, 'Content-Type': 'application/json' }
export async function sendOtp(email: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email, create_user: false }),
  })
  if (!r.ok) throw new Error(`otp send failed: ${r.status} ${await r.text()}`)
}
export async function verifyOtp(email: string, token: string): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email, token, type: 'email' }),
  })
  if (!r.ok) throw new Error(`otp verify failed: ${r.status} ${await r.text()}`)
  const d = (await r.json()) as any
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
    user: { id: d.user.id, email: d.user.email },
  }
}
