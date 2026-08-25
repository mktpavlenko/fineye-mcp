import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { listTransactions, txType, serializeTx, isScheduled } from '../domain/transactions.js'
import { output } from '../render.js'
import { fmtUnixDate, parseNum } from '../util.js'
import { warnStderr } from '../warn.js'
export const transactionsCmd = new Command('transactions')
  .alias('tx-list')
  .description('List transactions')
  .option('--from <date>')
  .option('--to <date>')
  .option('--account <id>')
  .option('--category <id>')
  .option('--search <q>')
  .option('--limit <n>', '', '100')
  .option('--page <n>', 'page number (1-based, use with --page-size)')
  .option('--page-size <n>', 'rows per page')
  .option('--json')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const limitOpt = parseNum(o.limit, 'limit') ?? 100
    const pageSize = parseNum(o.pageSize, 'page-size')
    const page = parseNum(o.page, 'page')
    const effPageSize = pageSize ?? (page ? limitOpt : undefined) // --page alone uses --limit as page size
    const limit = effPageSize ?? limitOpt
    const offset = effPageSize ? (Math.max(1, page ?? 1) - 1) * effPageSize : undefined
    const tx = await listTransactions(
      workspaceId,
      {
        from: o.from,
        to: o.to,
        account: o.account,
        category: o.category,
        search: o.search,
        limit,
        offset,
      },
      warnStderr,
    )
    if (o.json) {
      // full raw transactions (id, movements, tags, category, time…) for agents/scripts,
      // plus a derived `type` so agents don't treat a transfer's stale category as spending
      console.log(JSON.stringify(tx.map(serializeTx), null, 2))
      return
    }
    output(
      tx.map((t) => {
        const single = t.movements.length === 1
        const amount = single ? t.movements[0].sum : -(t.movements.find((m) => m.sum < 0)?.sum ?? 0)
        // Multi-currency: `amount` is in the account's currency; show what was actually charged.
        const inv = single ? t.movements[0].invoice : null
        return {
          id: t.id,
          date: fmtUnixDate(t.time),
          type: isScheduled(t) ? `${txType(t)} (scheduled)` : txType(t),
          amount: inv ? `${amount} (${inv.sum} ${inv.instrument})` : amount,
          desc: t.description ?? '',
          category: t.category ?? '', // faithful to DB (transfers backfilled to null at source)
        }
      }),
      false,
      ['id', 'date', 'type', 'amount', 'desc', 'category'],
    )
  })
