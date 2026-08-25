import type { Account } from '../types.js'
export function goalProgress(a: Account): { target: number; current: number; pct: number } {
  const target = a.goal ?? 0
  return { target, current: a.balance, pct: target ? (a.balance / target) * 100 : 0 }
}
