import type { Account } from '../types.js'
import { get } from '../client.js'
import { type RateMap } from './currency.js'
import { accountValueInMain, type CryptoPrices } from './valuation.js'
import type { Warn } from '../warn.js'
export function computeNetWorth(accounts: Account[], main: string, rates: RateMap, prices: CryptoPrices = {}): number {
  return accounts.filter((a) => a.includeInTotal).reduce((sum, a) => sum + accountValueInMain(a, prices, main, rates), 0)
}
// net_worth holds per-account balance SNAPSHOTS over time. Aggregate into a daily
// net-worth total trend (last snapshot per account per day, summed, in main currency).
export async function fetchNetWorthSeries(
  workspaceId: string,
  main: string,
  rates: RateMap,
  prices: CryptoPrices,
  days = 30,
  includeIds?: Set<string>, // only sum these account_ids (the includeInTotal set) so the trend matches headline net worth
  warn: Warn = () => {},
): Promise<number[]> {
  const cutoff = new Date(Date.now() - (days + 5) * 86_400_000).toISOString() // only recent snapshots, not the oldest 3000
  const rows = await get<Account & { created_at: string; account_id: string }>('net_worth', {
    workspace_id: `eq.${workspaceId}`,
    created_at: `gte.${cutoff}`,
    select: 'created_at,account_id,balance,type,currency,crypto,debts,stocks',
    order: 'created_at.desc', // desc + limit -> keep the MOST RECENT rows in the window
    limit: '5000',
  })
  if (rows.length >= 5000) warn('net-worth history hit the 5000-snapshot cap — the oldest days in the window may be missing')
  const perDay = new Map<string, Map<string, Account>>() // day -> account_id -> newest snapshot
  for (const r of rows) {
    if (includeIds && !includeIds.has(r.account_id)) continue // skip excluded-from-total accounts
    const day = String(r.created_at).slice(0, 10)
    if (!perDay.has(day)) perDay.set(day, new Map())
    const m = perDay.get(day)!
    if (!m.has(r.account_id)) m.set(r.account_id, r as unknown as Account) // desc -> first seen per (day,account) is newest
  }
  return [...perDay.keys()]
    .sort()
    .slice(-days)
    .map((day) => {
      let tot = 0
      for (const snap of perDay.get(day)!.values()) tot += accountValueInMain(snap, prices, main, rates)
      return tot
    })
}
