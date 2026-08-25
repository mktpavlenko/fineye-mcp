import { join } from 'node:path'
import { readFileSync, writeFileSync, rmSync, mkdirSync, chmodSync } from 'node:fs'
import { configDir } from '../config.js'
import type { Session } from '../types.js'
export const sessionFile = () => join(configDir(), 'session.json')
export function saveSession(s: Session) {
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(sessionFile(), JSON.stringify(s))
  chmodSync(sessionFile(), 0o600)
}
export function loadSession(): Session | null {
  try {
    return JSON.parse(readFileSync(sessionFile(), 'utf8'))
  } catch {
    return null
  }
}
export function clearSession() {
  try {
    rmSync(sessionFile(), { force: true })
  } catch {
    // already gone, or never existed — logging out is idempotent
  }
}
