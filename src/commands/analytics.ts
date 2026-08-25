import { Command } from 'commander'
import { requireWorkspace, fxContext } from './_shared.js'
import { listTransactions } from '../domain/transactions.js'
import { listCategories, rollupSpendToRoot } from '../domain/categories.js'
import { listTags } from '../domain/tags.js'
import { spendByCategory, spendByTag, spendByMerchant, totals, monthRange, currentMonth } from '../domain/analytics.js'
import { output } from '../render.js'
import { SCAN_LIMIT, warnStderr, warnFinancialMonth } from '../warn.js'

// All three go out at 2dp. They used to be emitted raw, so `net` could surface a float artifact
// (52031.259999999995) while income and expense happened to look clean — same numbers, different
// precision, in one object.
const money = (t: { income: number; expense: number; net: number }) => ({
  income: Number(t.income.toFixed(2)),
  expense: Number(t.expense.toFixed(2)),
  net: Number(t.net.toFixed(2)),
})

export const analyticsCmd = new Command('analytics')
  .description('Income/expense + spend by category (defaults to current month; --month YYYY-MM, --all)')
  .option('--month <YYYY-MM>')
  .option('--all', 'all time (no month filter)')
  .option('--leaf', 'break down by sub-category instead of rolling up into the top-level category')
  .option('--by-tag', 'break spending down by tag instead of category')
  .option('--by-merchant', 'break spending down by merchant instead of category')
  .option('--top <n>', 'with --by-merchant: keep only the N biggest merchants', '20')
  .option('--json')
  .action(async (o) => {
    // Validate the argument BEFORE authenticating: a typo in --month should not cost a network
    // round-trip, and should not report itself as a login problem.
    const { from, to } = monthRange(o.all ? undefined : (o.month ?? currentMonth()))
    const { workspaceId } = await requireWorkspace()
    const [raw, cats, fx] = await Promise.all([
      listTransactions(workspaceId, { from, to, limit: SCAN_LIMIT }, warnStderr),
      listCategories(workspaceId),
      fxContext(workspaceId),
    ])
    // Restate every leg in the main currency first — otherwise a USD account's -20 is added to a UAH -20.
    warnFinancialMonth(fx.financialMonthStart)
    const tx = fx.toMain(raw)
    const byId = new Map(cats.map((c) => [c.id, c.title]))
    const catById = new Map(cats.map((c) => [c.id, c]))
    const t = totals(tx)
    if (o.byMerchant) {
      const top = Number(o.top) > 0 ? Number(o.top) : 20
      const all = Object.entries(spendByMerchant(tx))
        .map(([merchant, v]) => ({
          merchant,
          total: Number(v.toFixed(2)),
          pct: t.expense ? `${((-v / t.expense) * 100).toFixed(1)}%` : '0%',
        }))
        .sort((a, b) => a.total - b.total)
      const rows = all.slice(0, top)
      if (o.json) {
        console.log(JSON.stringify({ currency: fx.main, ...money(t), byMerchant: rows }, null, 2))
        return
      }
      console.log(`Дохід +${t.income.toFixed(2)}  ·  Витрати -${t.expense.toFixed(2)}  ·  Net ${t.net.toFixed(2)}  (${fx.main})\n`)
      output(rows, false, ['merchant', 'total', 'pct'])
      if (all.length > rows.length) console.log(`… ще ${all.length - rows.length} мерчантів (--top ${all.length} щоб показати всіх)`)
      return
    }
    if (o.byTag) {
      const name = new Map((await listTags(workspaceId)).map((x) => [x.id, x.name]))
      const rows = Object.entries(spendByTag(tx))
        .map(([id, v]) => ({
          tag: name.get(id) ?? id,
          total: Number(v.toFixed(2)),
          pct: t.expense ? `${((-v / t.expense) * 100).toFixed(1)}%` : '0%',
        }))
        .sort((a, b) => a.total - b.total)
      if (o.json) {
        console.log(JSON.stringify({ currency: fx.main, ...money(t), byTag: rows }, null, 2))
        return
      }
      console.log(`Дохід +${t.income.toFixed(2)}  ·  Витрати -${t.expense.toFixed(2)}  ·  Net ${t.net.toFixed(2)}  (${fx.main})\n`)
      output(rows, false, ['tag', 'total', 'pct'])
      return
    }
    // Default: fold sub-category spend into its top-level category (matches the app). `--leaf` keeps detail.
    const sums = o.leaf ? spendByCategory(tx) : rollupSpendToRoot(spendByCategory(tx), catById)
    const rows = Object.entries(sums)
      .filter(([, v]) => v < 0)
      .map(([id, v]) => ({
        category: byId.get(id) ?? id,
        total: Number(v.toFixed(2)),
        pct: t.expense ? `${((-v / t.expense) * 100).toFixed(1)}%` : '0%',
      }))
      .sort((a, b) => a.total - b.total)
    if (o.json) {
      console.log(JSON.stringify({ currency: fx.main, ...money(t), byCategory: rows }, null, 2))
      return
    }
    const ratio = t.income ? ((t.expense / t.income) * 100).toFixed(0) : '∞'
    console.log(
      `Дохід +${t.income.toFixed(2)}  ·  Витрати -${t.expense.toFixed(2)}  ·  Net ${t.net.toFixed(2)} ${fx.main}  (витрати ${ratio}% доходу)\n`,
    )
    output(rows, false, ['category', 'total', 'pct'])
  })
