import { z } from 'zod'
import { requireWorkspace, fxContext } from '../../commands/_shared.js'
import { listWorkspaces } from '../../domain/workspaces.js'
import { listAccounts, resolveAccount } from '../../domain/accounts.js'
import { listTransactions, getTransactionById, serializeTx } from '../../domain/transactions.js'
import { listCategories, resolveCategory } from '../../domain/categories.js'
import { listTags } from '../../domain/tags.js'
import { listNotifications } from '../../domain/notifications.js'
import { getBudgetPeriod, listBudgetPeriods, carryOverAmount } from '../../domain/budgets.js'
import { holdings } from '../../domain/holdings.js'
import { goalProgress } from '../../domain/goals.js'
import { accountValueInMain } from '../../domain/valuation.js'
import { fetchCryptoPrices, fetchRates } from '../../domain/currency.js'
import { fetchNetWorthSeries, computeNetWorth } from '../../domain/networth.js'
import { totals, spendByCategory, spendByTag, spendByMerchant, monthRange, currentMonth } from '../../domain/analytics.js'
import { rollupSpendToRoot } from '../../domain/categories.js'
import { toCsv, flattenForExport, EXPORT_COLS } from '../../commands/export.js'
import { SCAN_LIMIT, warnFinancialMonth } from '../../warn.js'
import { FineyeError } from '../../errors.js'
import { run, collectWarnings, type ToolRegistrar } from './types.js'

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
const MONTH = z.string().regex(/^\d{4}-\d{2}$/, 'use YYYY-MM')

export const registerRead: ToolRegistrar = (server) => {
  server.registerTool(
    'fineye_workspaces',
    {
      title: 'Account & workspaces',
      description:
        'Who this server is logged in as, and the workspaces on that account. Every other tool reads and writes the ACTIVE workspace only — switching is a CLI operation (`fineye workspaces --use <id>`), so if the user asks about a different workspace, say so rather than answering from the active one.',
      inputSchema: {},
      annotations: READ,
    },
    () =>
      run(async () => {
        const { session, workspaceId } = await requireWorkspace()
        const all = await listWorkspaces(session.user.id)
        return {
          account: { email: session.user.email, userId: session.user.id },
          activeWorkspace: workspaceId,
          workspaces: all,
          ...(all.length > 1 ? { note: 'only the active workspace is reachable from this server' } : {}),
        }
      }),
  )

  server.registerTool(
    'fineye_accounts',
    {
      title: 'Accounts & balances',
      description:
        "Accounts with balances. view='goals' adds savings-goal target/current/percent (goal-type accounts, same set as the app's Goals screen); view='holdings' breaks an account down into crypto or stock positions valued at current prices (stocks have no price source — those rows come back estimated with a null P&L).",
      inputSchema: {
        view: z.enum(['list', 'goals', 'holdings']).default('list'),
        account: z
          .string()
          .optional()
          .describe(
            "account name or id — defaults to the first crypto/stocks account for view='holdings'; pass it explicitly if there is more than one",
          ),
        includeArchived: z.boolean().default(false),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        if (a.view === 'holdings') {
          // The auto-pick must not land on an archived account; an explicit ref may still name one.
          const acc = a.account
            ? await resolveAccount(workspaceId, a.account)
            : (await listAccounts(workspaceId)).find((x) => x.type === 'crypto' || x.type === 'stocks')
          if (!acc) throw new FineyeError('No crypto/stocks account found', 'not_found')
          const rows = holdings(acc, await fetchCryptoPrices())
          return { account: acc.name, holdings: rows.map((h) => (h.estimated ? { ...h, pnl: null, pnlPct: null } : h)) }
        }
        const accts = await listAccounts(workspaceId, a.includeArchived)
        // Same set as `fineye goals` and the app's Goals screen — not every account with a target.
        if (a.view === 'goals') return accts.filter((x) => x.type === 'goal').map((x) => ({ ...x, ...goalProgress(x) }))
        return accts
      }),
  )

  server.registerTool(
    'fineye_networth',
    {
      title: 'Net worth',
      description:
        'Net worth in the workspace main currency, with a per-account breakdown. history:true adds the daily series for the last `days` days.',
      inputSchema: {
        history: z.boolean().default(false),
        days: z.number().int().min(1).max(365).default(30).describe('length of the history series'),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        const [accts, rates, prices, fx] = await Promise.all([
          listAccounts(workspaceId),
          fetchRates(),
          fetchCryptoPrices(),
          fxContext(workspaceId),
        ])
        // Same predicate as computeNetWorth/the TUI — `!== false` would count an account whose
        // column is null and hand back a different headline total than `fineye networth`.
        const counted = accts.filter((x) => x.includeInTotal)
        const perAccount = counted.map((x) => ({ id: x.id, name: x.name, value: accountValueInMain(x, prices, fx.main, rates) }))
        const total = computeNetWorth(accts, fx.main, rates, prices)
        const w = collectWarnings()
        const series = a.history
          ? await fetchNetWorthSeries(workspaceId, fx.main, rates, prices, a.days, new Set(counted.map((x) => x.id)), w.warn)
          : undefined
        return w.attach({ currency: fx.main, netWorth: Number(total.toFixed(2)), accounts: perAccount, ...(series ? { series } : {}) })
      }),
  )

  server.registerTool(
    'fineye_transactions',
    {
      title: 'Transactions',
      description:
        "List transactions as raw rows plus a derived `type` (expense|income|transfer) and `scheduled` flag, newest first. Pass `id` to fetch exactly one. Amounts live in movements[].sum, in each account's own currency. If `count` equals `limit` there are probably more rows — page with `offset` or narrow with from/to.",
      inputSchema: {
        id: z.string().optional().describe('fetch a single transaction by id; ignores the other filters'),
        from: DATE.optional(),
        to: DATE.optional().describe('inclusive of the whole day'),
        account: z.string().optional().describe('account name or id'),
        category: z.string().optional().describe('category name or id'),
        search: z.string().optional().describe('substring of the description (case-insensitive)'),
        limit: z.number().int().min(1).max(1000).default(100),
        offset: z.number().int().min(0).optional(),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        if (a.id) {
          const t = await getTransactionById(workspaceId, a.id)
          if (!t) throw new FineyeError(`Transaction not found: ${a.id}`, 'not_found')
          return serializeTx(t)
        }
        const w = collectWarnings()
        // The underlying filters match raw ids only, and a name there fails SILENTLY with 0 rows —
        // resolve first so "black" works and a typo errors with not_found instead of an empty list.
        const [account, category] = await Promise.all([
          a.account ? resolveAccount(workspaceId, a.account).then((x) => x.id) : undefined,
          a.category ? resolveCategory(workspaceId, a.category).then((x) => x.id) : undefined,
        ])
        const rows = await listTransactions(
          workspaceId,
          { from: a.from, to: a.to, account, category, search: a.search, limit: a.limit, offset: a.offset },
          w.warn,
        )
        return w.attach({ count: rows.length, transactions: rows.map(serializeTx) })
      }),
  )

  server.registerTool(
    'fineye_analytics',
    {
      title: 'Spending analytics',
      description:
        'Income, expense and net for a period, plus a spend breakdown — all restated in the workspace main currency. Excludes transfers and scheduled installments. Defaults to the current month; pass from/to for any other window (a quarter, the last 7 days).',
      inputSchema: {
        month: MONTH.optional(),
        from: DATE.optional().describe('arbitrary window start — use instead of month'),
        to: DATE.optional().describe('arbitrary window end, inclusive of the whole day'),
        all: z.boolean().default(false).describe('ignore the month and cover all time'),
        groupBy: z.enum(['category', 'leafCategory', 'tag', 'merchant']).default('category'),
        top: z.number().int().min(1).max(200).default(20),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        if ((a.month || a.all) && (a.from || a.to))
          throw new FineyeError('Use either month, all, or from/to — not a combination', 'invalid')
        const window = a.from || a.to ? { from: a.from, to: a.to } : null
        const { from, to } = a.all ? {} : (window ?? monthRange(a.month ?? currentMonth()))
        const w = collectWarnings()
        const [raw, cats, fx] = await Promise.all([
          listTransactions(workspaceId, { from, to, limit: SCAN_LIMIT }, w.warn),
          listCategories(workspaceId),
          fxContext(workspaceId),
        ])
        warnFinancialMonth(fx.financialMonthStart, w.warn)
        const tx = fx.toMain(raw)
        const t = totals(tx)
        const title = new Map(cats.map((c) => [c.id, c.title]))
        let breakdown: { key: string; total: number }[]
        if (a.groupBy === 'tag') {
          const tags = await listTags(workspaceId)
          const name = new Map(tags.map((x) => [x.id, x.name]))
          breakdown = Object.entries(spendByTag(tx)).map(([k, v]) => ({ key: name.get(k) ?? k, total: Number(v.toFixed(2)) }))
        } else if (a.groupBy === 'merchant') {
          breakdown = Object.entries(spendByMerchant(tx)).map(([k, v]) => ({ key: k, total: Number(v.toFixed(2)) }))
        } else {
          const spend = spendByCategory(tx)
          const rolled = a.groupBy === 'leafCategory' ? spend : rollupSpendToRoot(spend, new Map(cats.map((c) => [c.id, c])))
          // spendByCategory returns every non-zero sum, income included — this is a SPEND
          // breakdown, so income categories would both mislead and skew `truncatedBreakdown`.
          breakdown = Object.entries(rolled)
            .filter(([, v]) => v < 0)
            .map(([k, v]) => ({ key: title.get(k) ?? k, total: Number(v.toFixed(2)) }))
        }
        breakdown.sort((x, y) => x.total - y.total)
        return w.attach({
          period: a.all ? 'all' : window ? `${a.from ?? 'start'}..${a.to ?? 'today'}` : (a.month ?? currentMonth()),
          currency: fx.main,
          income: Number(t.income.toFixed(2)),
          expense: Number(t.expense.toFixed(2)),
          net: Number(t.net.toFixed(2)),
          groupBy: a.groupBy,
          breakdown: breakdown.slice(0, a.top),
          truncatedBreakdown: breakdown.length > a.top ? breakdown.length - a.top : 0,
        })
      }),
  )

  server.registerTool(
    'fineye_budget',
    {
      title: 'Budget',
      description:
        "The month's total budget against what was actually spent. FinEye budgets are one total per period (there are no per-category budgets). action='history' lists past periods.",
      inputSchema: {
        action: z.enum(['show', 'history']).default('show'),
        month: MONTH.optional(),
        limit: z.number().int().min(1).max(60).default(12),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        const w = collectWarnings()
        const fx = await fxContext(workspaceId)
        const periods =
          a.action === 'history'
            ? (await listBudgetPeriods(workspaceId)).filter((bp) => /^\d{4}-\d{2}$/.test(bp.period_key)).slice(0, a.limit)
            : [await getBudgetPeriod(workspaceId, a.month ?? currentMonth())].filter((x) => x != null)
        if (a.action === 'show' && !periods.length)
          return { period: a.month ?? currentMonth(), budget: null, note: 'no budget set for this period' }
        const rows = await Promise.all(
          periods.map(async (bp) => {
            warnFinancialMonth(bp.financial_month_start, w.warn)
            const { from, to } = monthRange(bp.period_key)
            const currency = bp.total_budget?.currency ?? fx.main
            const spent = fx.fromMain(
              totals(fx.toMain(await listTransactions(workspaceId, { from, to, limit: SCAN_LIMIT }, w.warn))).expense,
              currency,
            )
            const budget = bp.total_budget?.amount ?? 0
            const available = budget + carryOverAmount(bp)
            return {
              period: bp.period_key,
              budget,
              currency,
              carryOver: Number(carryOverAmount(bp).toFixed(2)),
              available: Number(available.toFixed(2)),
              spent: Number(spent.toFixed(2)),
              remaining: Number((available - spent).toFixed(2)),
              pct: available ? Number(((spent / available) * 100).toFixed(1)) : 0,
            }
          }),
        )
        return w.attach(a.action === 'history' ? { periods: rows } : rows[0])
      }),
  )

  server.registerTool(
    'fineye_categories',
    {
      title: 'Categories',
      description:
        'Categories with their hierarchy (parent id + parentTitle). Use this to turn a category name into the id every write expects.',
      inputSchema: { includeArchived: z.boolean().default(false) },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        const all = await listCategories(workspaceId)
        const cats = a.includeArchived ? all : all.filter((c) => !c.archived_at)
        const title = new Map(all.map((c) => [c.id, c.title]))
        return cats.map((c) => ({ ...c, parentTitle: c.parent ? (title.get(c.parent) ?? null) : null }))
      }),
  )

  server.registerTool(
    'fineye_tags',
    {
      title: 'Tags',
      description: 'Tags (id + name). Use this to turn a tag name into the id the write tools expect.',
      inputSchema: {},
      annotations: READ,
    },
    () =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        return listTags(workspaceId)
      }),
  )

  server.registerTool(
    'fineye_notifications',
    {
      title: 'App notifications',
      description: 'The in-app notification inbox — this is where FinEye announces product changes.',
      inputSchema: {},
      annotations: READ,
    },
    () => run(async () => listNotifications()),
  )

  server.registerTool(
    'fineye_export',
    {
      title: 'Export transactions',
      description:
        "Transactions as CSV or JSON text, returned INLINE in the response — narrow with from/to, a full-history export can be very large. If `count` equals `limit` the export was cut off. `amount` is RAW in that row's own currency — do not sum across currencies; use fineye_analytics for normalized totals.",
      inputSchema: {
        format: z.enum(['csv', 'json']).default('csv'),
        from: DATE.optional(),
        to: DATE.optional(),
        limit: z.number().int().min(1).max(SCAN_LIMIT).default(1000),
      },
      annotations: READ,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        const w = collectWarnings()
        const [raw, accts] = await Promise.all([
          listTransactions(workspaceId, { from: a.from, to: a.to, limit: a.limit }, w.warn),
          listAccounts(workspaceId),
        ])
        const rows = flattenForExport(raw, new Map(accts.map((x) => [x.id, x.currency])))
        return w.attach({ format: a.format, count: rows.length, data: a.format === 'csv' ? toCsv(rows, EXPORT_COLS) : rows })
      }),
  )
}
