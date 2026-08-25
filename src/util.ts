import { FineyeError } from './errors.js'
// Parse a user date string to unix seconds; throws on an unparseable value (so a
// bad --date never gets written as the literal "NaN").
export function parseDateToUnix(s: string): number {
  const ms = new Date(s).getTime()
  if (Number.isNaN(ms)) throw new FineyeError(`Invalid date: "${s}" (use YYYY-MM-DD)`, 'invalid')
  return Math.floor(ms / 1000)
}
// Format a (possibly corrupt) unix-second timestamp for display; never throws.
export function fmtUnixDate(time: string | number, slice: 'date' | 'md' = 'date'): string {
  const raw = typeof time === 'string' ? time.trim() : time
  const ms = (raw === '' ? NaN : Number(raw)) * 1000 // Number('') is 0, treat blank as invalid
  if (!Number.isFinite(ms)) return '—'
  const iso = new Date(ms).toISOString()
  return slice === 'md' ? iso.slice(5, 10) : iso.slice(0, 10)
}
// Validate a numeric CLI option; throws with a clear message instead of sending NaN to the API.
export function parseNum(s: string | undefined, name: string): number | undefined {
  if (s === undefined) return undefined
  const n = Number(s)
  if (!Number.isFinite(n)) throw new FineyeError(`Invalid ${name}: "${s}" (expected a number)`, 'invalid')
  return n
}
