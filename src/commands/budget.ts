import { Command } from 'commander'
import { requireWorkspace, fxContext } from './_shared.js'
import { listTransactions } from '../domain/transactions.js'
import { getBudgetPeriod, setBudgetPeriod, listBudgetPeriods, carryOverAmount } from '../domain/budgets.js'
import { totals, monthRange, currentMonth } from '../domain/analytics.js'
import { output } from '../render.js'
import { parseNum } from '../util.js'
import { CARRY_OVER_MODES, type CarryOverMode } from '../types.js'
import { SCAN_LIMIT, warnStderr, warnFinancialMonth } from '../warn.js'
import { FineyeError } from '../errors.js'

// Parent has NO action/options of its own — `show` is the default subcommand. This avoids the
// commander parent/child option clash (a parent --month was swallowing the subcommand's --month).
export const budgetCmd = new Command('budget').description('Monthly budget: total vs spent vs remaining')

budgetCmd
  .command('show', { isDefault: true })
  .description('Show the budget for a period (current month unless --month)')
  .option('--month <YYYY-MM>')
  .option('--json')
  .action(async (o) => {
    const period = o.month ?? currentMonth()
    const { from, to } = monthRange(period) // validate before authenticating — see analytics.ts
    const { workspaceId } = await requireWorkspace()
    const [bp, raw, fx] = await Promise.all([
      getBudgetPeriod(workspaceId, period),
      listTransactions(workspaceId, { from, to, limit: SCAN_LIMIT }, warnStderr),
      fxContext(workspaceId),
    ])
    warnFinancialMonth(bp?.financial_month_start)
    const budget = bp?.total_budget?.amount ?? 0
    const currency = bp?.total_budget?.currency ?? fx.main
    // Spend is aggregated in the main currency; restate it in the BUDGET's currency so the
    // comparison is apples-to-apples even when they differ.
    const main = totals(fx.toMain(raw))
    const t = { ...main, expense: fx.fromMain(main.expense, currency) }
    // Rolled-over leftover raises the spendable amount for the period — the app counts it in,
    // so `remaining` must too (it used to report budget - spent and understate the headroom).
    const carry = carryOverAmount(bp)
    const available = budget + carry
    const result = {
      period,
      budget,
      currency,
      spent: Number(t.expense.toFixed(2)),
      remaining: Number((available - t.expense).toFixed(2)),
      pct: available ? Number(((t.expense / available) * 100).toFixed(1)) : 0,
      plannedIncome: bp?.planned_income?.amount ?? null,
      carryOverMode: bp?.carry_over_mode ?? 'none',
      carryOverMaxPercent: bp?.carry_over_max_percent ?? null,
      carryOverApplied: Number(carry.toFixed(2)),
      available: Number(available.toFixed(2)),
    }
    if (o.json) {
      console.log(JSON.stringify(result, null, 2))
      return
    }
    if (!bp?.total_budget) {
      console.log(`No budget set for ${period}. Set one:  fineye budget set --amount <n>`)
      return
    }
    const carryNote = carry ? `  ·  Перенос +${Math.round(carry)} (${result.carryOverMode})` : ''
    console.log(
      `Бюджет ${period}: ${budget} ${currency}${carryNote}  ·  Витрачено ${Math.round(t.expense)}  ·  Залишок ${Math.round(result.remaining)}  (${result.pct}% бюджету)`,
    )
  })

budgetCmd
  .command('history')
  .description('All budgeted periods with what was actually spent in each')
  .option('--limit <n>', 'how many periods (newest first)', '12')
  .option('--json')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    // A period_key the app ever writes in another shape would make monthRange throw and take the
    // whole Promise.all down with it — skip such rows instead of failing the entire history.
    const periods = (await listBudgetPeriods(workspaceId))
      .filter((bp) => /^\d{4}-\d{2}$/.test(bp.period_key))
      .slice(0, Number(o.limit) > 0 ? Number(o.limit) : 12)
    const fx = await fxContext(workspaceId)
    warnFinancialMonth(periods.find((bp) => bp.financial_month_start != null && bp.financial_month_start !== 1)?.financial_month_start)
    // One transactions fetch per period — the periods are few (a dozen) and each needs its own month bounds.
    const rows = await Promise.all(
      periods.map(async (bp) => {
        const { from, to } = monthRange(bp.period_key)
        const currency = bp.total_budget?.currency ?? fx.main
        const spent = fx.fromMain(
          totals(fx.toMain(await listTransactions(workspaceId, { from, to, limit: SCAN_LIMIT }, warnStderr))).expense,
          currency,
        )
        const budget = bp.total_budget?.amount ?? 0
        const available = budget + carryOverAmount(bp)
        return {
          period: bp.period_key,
          budget,
          carryOver: Number(carryOverAmount(bp).toFixed(2)),
          spent: Number(spent.toFixed(2)),
          remaining: Number((available - spent).toFixed(2)),
          pct: available ? Number(((spent / available) * 100).toFixed(1)) : 0,
          currency,
        }
      }),
    )
    if (o.json) {
      console.log(JSON.stringify(rows, null, 2))
      return
    }
    output(
      rows.map((r) => ({ ...r, spent: Math.round(r.spent), remaining: Math.round(r.remaining), pct: `${r.pct}%` })),
      false,
      ['period', 'budget', 'carryOver', 'spent', 'remaining', 'pct', 'currency'],
    )
  })

budgetCmd
  .command('set')
  .description('Set the total budget for a period (current month unless --month)')
  .requiredOption('--amount <n>', 'total budget amount')
  .option('--currency <c>', 'currency code', 'UAH')
  .option('--planned-income <n>', 'planned income for the period')
  .option('--carry-over <mode>', `roll last period's leftover in: ${CARRY_OVER_MODES.join(' | ')}`)
  .option('--carry-over-max-percent <n>', 'with --carry-over percent: cap as % of the budget')
  .option('--month <YYYY-MM>')
  .action(async (o) => {
    const { session, workspaceId } = await requireWorkspace()
    const period = o.month ?? currentMonth()
    const amount = parseNum(o.amount, 'amount')
    if (amount == null) throw new FineyeError('--amount must be a number', 'invalid')
    const plannedIncome = parseNum(o.plannedIncome, 'planned-income')
    // The DB enforces these three via a check constraint — reject early with a usable message
    // instead of letting PostgREST return a raw constraint violation.
    if (o.carryOver && !(CARRY_OVER_MODES as readonly string[]).includes(o.carryOver))
      throw new FineyeError(`--carry-over must be one of: ${CARRY_OVER_MODES.join(', ')}`, 'invalid')
    const maxPercent = parseNum(o.carryOverMaxPercent, 'carry-over-max-percent')
    if (maxPercent != null && (maxPercent < 0 || maxPercent > 100))
      throw new FineyeError('--carry-over-max-percent must be 0-100', 'invalid')
    if (o.carryOver === 'percent' && maxPercent == null)
      throw new FineyeError('--carry-over percent requires --carry-over-max-percent <n>', 'invalid')
    const saved = await setBudgetPeriod(workspaceId, session.user.id, period, {
      total_budget: { amount, currency: o.currency },
      ...(plannedIncome != null ? { planned_income: { amount: plannedIncome, currency: o.currency } } : {}),
      ...(o.carryOver ? { carry_over_mode: o.carryOver as CarryOverMode } : {}),
      ...(maxPercent != null ? { carry_over_max_percent: maxPercent } : {}),
    })
    console.log(
      `Set budget ${saved.period_key}: ${saved.total_budget?.amount} ${saved.total_budget?.currency}` +
        `${saved.carry_over_mode && saved.carry_over_mode !== 'none' ? `, carry-over ${saved.carry_over_mode}${saved.carry_over_max_percent != null ? ` ≤${saved.carry_over_max_percent}%` : ''}` : ''}`,
    )
  })
