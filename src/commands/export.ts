import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { requireWorkspace } from './_shared.js'
import { listTransactions, txType, isScheduled } from '../domain/transactions.js'
import { listAccounts } from '../domain/accounts.js'
import { fmtUnixDate } from '../util.js'
import type { Transaction } from '../types.js'
import { SCAN_LIMIT, warnStderr } from '../warn.js'
export function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}
export const EXPORT_COLS = ['id', 'date', 'type', 'amount', 'currency', 'scheduled', 'legs', 'description', 'category']
// Flatten transactions for CSV/JSON. Faithful to the DB — `category` is passed
// through verbatim (transfers were backfilled to category=null at the source, so
// no surface-level rewriting is needed). The derived `type` stays as the canonical
// signal for analytics (gate spend on `type === 'expense'`).
// `amount` is raw and UNCONVERTED (unlike analytics/budget): the export is a faithful dump,
// so `currency` names the unit and `scheduled` flags rows that are not actual spend yet.
// ponytail: a cross-currency transfer still sums two currencies into `amount` (legs=2 marks it);
// give each leg its own row if per-leg fidelity is ever needed.
export function flattenForExport(tx: Transaction[], acctCurrency: Map<string, string> = new Map()) {
  return tx.map((t) => ({
    id: t.id,
    date: fmtUnixDate(t.time),
    type: txType(t),
    amount: t.movements.reduce((s, m) => s + m.sum, 0),
    currency: acctCurrency.get(t.movements[0]?.account.id ?? '') ?? '',
    scheduled: isScheduled(t),
    legs: t.movements.length,
    description: t.description ?? '',
    category: t.category ?? null,
  }))
}
export const exportCmd = new Command('export')
  .description('Export transactions to CSV or JSON')
  .option('--format <fmt>', 'csv|json', 'csv')
  .option('--from <date>')
  .option('--to <date>')
  .option('--out <file>')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const [tx, accts] = await Promise.all([
      listTransactions(workspaceId, { from: o.from, to: o.to, limit: SCAN_LIMIT }, warnStderr),
      listAccounts(workspaceId),
    ])
    const flat = flattenForExport(tx, new Map(accts.map((a) => [a.id, a.currency])))
    const out =
      o.format === 'json'
        ? JSON.stringify(flat, null, 2) // same shape to stdout and --out file
        : toCsv(flat, EXPORT_COLS)
    if (o.out) {
      writeFileSync(o.out, out)
      console.log(`Wrote ${flat.length} transactions to ${o.out}`)
    } else {
      console.log(out)
    }
  })
