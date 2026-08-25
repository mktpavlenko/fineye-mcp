import { SUPABASE_URL, ANON_KEY } from '../constants.js'
import { createPkce } from './pkce.js'
import { captureCode } from './capture.js'
import { saveSession } from './tokenStore.js'
import type { Session } from '../types.js'
import { spawn } from 'node:child_process'
export async function exchangeCode(code: string, verifier: string): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  })
  if (!res.ok) throw new Error(`exchange failed: ${res.status} ${await res.text()}`)
  const d = (await res.json()) as any
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
    user: { id: d.user.id, email: d.user.email },
  }
}
export function buildAuthUrl(challenge: string, redirect = 'http://localhost:54399'): string {
  const p = new URLSearchParams({
    provider: 'google',
    redirect_to: redirect,
    code_challenge: challenge,
    code_challenge_method: 's256',
    prompt: 'select_account',
  })
  return `${SUPABASE_URL}/auth/v1/authorize?${p}`
}
export function openBrowser(url: string) {
  spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
}
export async function runLogin(deps: { readClipboard: () => Promise<string>; promptCode: () => Promise<string> }): Promise<Session> {
  const { verifier, challenge } = createPkce()
  const url = buildAuthUrl(challenge)
  const ignore = await deps.readClipboard().catch(() => '') // exclude whatever is already on the clipboard
  openBrowser(url)
  const code = await captureCode({ ...deps, ignore }) // races clipboard-poll vs manual prompt
  const session = await exchangeCode(code, verifier)
  saveSession(session)
  return session
}
