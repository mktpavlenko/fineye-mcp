import { writeFileSync } from 'node:fs'
import { listTransactions, isScheduled } from './transactions.js'
import { listCategories, resolveCategory, selectCategories } from './categories.js'
import { FineyeError } from '../errors.js'
import { SCAN_LIMIT, type Warn } from '../warn.js'
import type { Category, Transaction } from '../types.js'

export interface TxSelection {
  from?: string
  to?: string
  account?: string
  category?: string
  search?: string
}
export const hasTxSelection = (s: TxSelection): boolean => !!(s.from || s.to || s.account || s.category || s.search)

// Every bulk action starts here. Two rules that only make sense in bulk:
//  - a selection is mandatory (there is no "all rows" mode, on purpose)
//  - a truncated read is fatal, not a warning: elsewhere the caller shows a shorter list, here it
//    would delete or rewrite a silent subset and report success
export async function selectTransactions(workspaceId: string, sel: TxSelection, warn: Warn = () => {}): Promise<Transaction[]> {
  if (!hasTxSelection(sel)) throw new FineyeError('Refusing to run without a filter (from/to/account/category/search)', 'gate')
  let truncated = false
  const rows = await listTransactions(workspaceId, { ...sel, limit: SCAN_LIMIT }, (m) => {
    truncated = true
    warn(m)
  })
  if (truncated)
    throw new FineyeError(
      `Too many matches (${rows.length}) — refusing to run a bulk operation on a truncated set. Narrow it with from/to.`,
      'gate',
    )
  return rows
}

// Scheduled legs are installment payments the bank has not executed yet, dated years out. Deleting
// them is irreversible and is almost never what "delete these transactions" meant.
export const withoutScheduled = (txns: Transaction[]): Transaction[] => txns.filter((t) => !isScheduled(t))
export const countScheduled = (txns: Transaction[]): number => txns.filter(isScheduled).length

export async function pickCategories(workspaceId: string, sel: { ids?: string[]; parent?: string; match?: string }): Promise<Category[]> {
  if (!sel.ids?.length && !sel.parent && !sel.match) throw new FineyeError('Specify a selection: ids / parent / match', 'gate')
  const all = await listCategories(workspaceId)
  const parentId = sel.parent ? (await resolveCategory(workspaceId, sel.parent)).id : undefined
  return selectCategories(all, { ids: sel.ids, parentId, match: sel.match })
}

// Snapshot before an irreversible delete. 0600 because these are the user's financial records
// sitting in a world-readable directory under a guessable name.
export function backup(tag: string, rows: unknown[], now: number = Date.now()): string {
  const path = `/tmp/fineye-bulk-${tag}-${now}.json`
  writeFileSync(path, JSON.stringify(rows, null, 2), { mode: 0o600 })
  return path
}

export interface ApplyResult {
  done: number
  fails: { id: string; err: string }[]
}
// Run `fn` over every item, a few at a time, collecting failures instead of aborting the batch
// half-done. Callers report `fails` — a bare count reads like a rounding error.
export async function applyAll<T extends { id: string }>(items: T[], fn: (t: T) => Promise<unknown>, conc = 6): Promise<ApplyResult> {
  let done = 0
  const fails: ApplyResult['fails'] = []
  for (let i = 0; i < items.length; i += conc) {
    await Promise.all(
      items.slice(i, i + conc).map(async (t) => {
        try {
          await fn(t)
          done++
        } catch (e) {
          fails.push({ id: t.id, err: e instanceof Error ? e.message : String(e) })
        }
      }),
    )
  }
  return { done, fails }
}
