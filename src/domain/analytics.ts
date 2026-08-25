import type { Transaction } from '../types.js'
import { isScheduled } from './transactions.js'
import { convert, type RateMap } from './currency.js'
import { FineyeError } from '../errors.js'
// Scheduled (installment) legs are future planned payments, not actual spend — exclude
// them from every aggregate so a 2027 installment can't inflate a month's expenses.
function executed(tx: Transaction[]): Transaction[] {
  return tx.filter((t) => !isScheduled(t))
}
// A split "part" carves an amount out of its original. Map original-id -> total carved off,
// so we can reduce the original and avoid double-counting (original + parts).
function splitDeductions(tx: Transaction[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tx)
    for (const mv of t.movements)
      if (mv.split_from_transaction_id) m.set(mv.split_from_transaction_id, (m.get(mv.split_from_transaction_id) ?? 0) + mv.sum)
  return m
}
// movements[].sum is denominated in the ACCOUNT's currency, so a workspace with accounts in
// UAH + USD + EUR was summing raw numbers of different currencies together. Restate every leg
// in the workspace main currency BEFORE aggregating. Legs whose account or rate is unknown are
// left untouched (same fallback as valuation.ts) rather than dropped.
// ponytail: uses TODAY's rates even for past months (the backend keeps no rate history), so an
// old month's foreign-currency spend drifts with the rate; per-date rates if that ever matters.
export function normalizeToMain(txAll: Transaction[], acctCurrency: Map<string, string>, main: string, rates: RateMap): Transaction[] {
  return txAll.map((t) => ({
    ...t,
    movements: t.movements.map((m) => {
      const cur = acctCurrency.get(m.account.id)
      if (!cur || cur === main) return m
      try {
        return { ...m, sum: convert(m.sum, cur, main, rates), fee: convert(m.fee, cur, main, rates) }
      } catch {
        return m
      }
    }),
  }))
}
// The bank-supplied merchant label — the only merchant name the API carries (2026-08 update).
// Falls back to the description so manually-added transactions still group sensibly.
export function merchantName(t: Transaction): string {
  const m = typeof t.merchant === 'object' && t.merchant !== null ? t.merchant : null
  return m?.title?.trim() || t.description?.trim() || '(no merchant)'
}
// Spend grouped by merchant. Same rules as spendByCategory (executed, single-leg, split-aware),
// expenses only — merchants are a spending lens, income rows would just be noise.
export function spendByMerchant(txAll: Transaction[]): Record<string, number> {
  const tx = executed(txAll)
  const ded = splitDeductions(tx)
  const out: Record<string, number> = {}
  for (const t of tx) {
    if (t.movements.length !== 1) continue
    const amount = t.movements[0].sum - (ded.get(t.id) ?? 0)
    if (amount >= 0) continue
    const key = merchantName(t)
    out[key] = (out[key] ?? 0) + amount
  }
  return out
}
// Single-leg transactions only (transfers = 2-leg, excluded). Group sums by category id
// ('uncategorized' for null); a split original is reduced by the parts carved out of it.
export function spendByCategory(txAll: Transaction[]): Record<string, number> {
  const tx = executed(txAll)
  const ded = splitDeductions(tx)
  const out: Record<string, number> = {}
  for (const t of tx) {
    if (t.movements.length !== 1) continue // skip transfers / multi-leg
    const amount = t.movements[0].sum - (ded.get(t.id) ?? 0)
    if (amount === 0) continue
    const key = t.category ?? 'uncategorized'
    out[key] = (out[key] ?? 0) + amount
  }
  return out
}
// Spend grouped by tag id (a transaction counts toward EACH of its tags). Expenses only.
// Splits are deducted from the original, same as spendByCategory.
export function spendByTag(txAll: Transaction[]): Record<string, number> {
  const tx = executed(txAll)
  const ded = splitDeductions(tx)
  const out: Record<string, number> = {}
  for (const t of tx) {
    if (t.movements.length !== 1) continue
    const amount = t.movements[0].sum - (ded.get(t.id) ?? 0)
    if (amount >= 0) continue // spending only
    for (const tag of t.tags ?? []) out[tag] = (out[tag] ?? 0) + amount
  }
  return out
}
export function totals(txAll: Transaction[]): { income: number; expense: number; net: number } {
  const tx = executed(txAll)
  const ded = splitDeductions(tx)
  let income = 0
  let expense = 0
  for (const t of tx) {
    if (t.movements.length !== 1) continue
    const s = t.movements[0].sum - (ded.get(t.id) ?? 0)
    if (s > 0) income += s
    else expense += -s
  }
  return { income, expense, net: income - expense }
}
export function avgPerDay(tx: Transaction[], days: number): number {
  return days > 0 ? totals(tx).expense / days : 0
}
// Current month as 'YYYY-MM' (date injectable for tests).
export function currentMonth(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
// Month bounds (ISO yyyy-mm-dd) for `--month YYYY-MM`; no arg -> no bounds.
export function monthRange(month?: string): { from?: string; to?: string } {
  if (!month) return {}
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) throw new FineyeError(`Invalid month: "${month}" (use YYYY-MM)`, 'invalid')
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) throw new FineyeError(`Invalid month: "${month}" (month must be 01-12)`, 'invalid')
  return {
    from: new Date(Date.UTC(y, mo - 1, 1)).toISOString().slice(0, 10),
    // last day of the month — listTransactions treats `to` as inclusive through end-of-day
    to: new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10),
  }
}
