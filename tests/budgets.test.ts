import { describe, it, expect, vi, afterEach } from 'vitest'
import * as client from '../src/client.js'
import { getBudgetPeriod, setBudgetPeriod, listBudgetPeriods, carryOverAmount } from '../src/domain/budgets.js'

afterEach(() => vi.restoreAllMocks())

describe('budget_periods (2026 total-per-period model)', () => {
  it('getBudgetPeriod queries by workspace + period_key', async () => {
    const spy = vi.spyOn(client, 'getOne').mockResolvedValue({ id: 'b', total_budget: { amount: 1000, currency: 'UAH' } } as any)
    const r = await getBudgetPeriod('w', '2026-06')
    const q = spy.mock.calls[0][1] as any
    expect(q.workspace_id).toBe('eq.w')
    expect(q.period_key).toBe('eq.2026-06')
    expect(r?.total_budget?.amount).toBe(1000)
  })
  it('setBudgetPeriod upserts the total budget, preserving carry-over and reusing the existing id', async () => {
    vi.spyOn(client, 'getOne').mockResolvedValue({
      id: 'existing-id',
      period_key: '2026-06',
      financial_month_start: 1,
      carry_over_mode: 'full', // one of the three values the DB check constraint accepts
      planned_income: { amount: 5, currency: 'UAH' },
    } as any)
    const spy = vi.spyOn(client, 'write').mockResolvedValue([{ id: 'existing-id' }] as any)
    await setBudgetPeriod('w', 'u', '2026-06', { total_budget: { amount: 50000, currency: 'UAH' } })
    const [table, row] = spy.mock.calls[0]
    expect(table).toBe('budget_periods')
    expect((row as any).id).toBe('existing-id') // reuse -> upsert, not duplicate
    expect((row as any).user_id).toBe('u') // RLS
    expect((row as any).total_budget).toEqual({ amount: 50000, currency: 'UAH' })
    expect((row as any).carry_over_mode).toBe('full') // preserved
    expect((row as any).planned_income).toEqual({ amount: 5, currency: 'UAH' }) // preserved when not patched
  })
})

describe('carry-over (rollover of the previous period leftover)', () => {
  it('carryOverAmount respects the mode and the percent cap', () => {
    const base = { total_budget: { amount: 10000, currency: 'UAH' }, total_carry_over_applied: { amount: 3000, currency: 'UAH' } }
    expect(carryOverAmount(null)).toBe(0)
    expect(carryOverAmount({ ...base, carry_over_mode: 'none' } as any)).toBe(0)
    expect(carryOverAmount({ ...base } as any)).toBe(0) // mode absent -> treated as 'none'
    expect(carryOverAmount({ ...base, carry_over_mode: 'full' } as any)).toBe(3000)
    expect(carryOverAmount({ ...base, carry_over_mode: 'percent', carry_over_max_percent: 10 } as any)).toBe(1000) // capped
    expect(carryOverAmount({ ...base, carry_over_mode: 'percent', carry_over_max_percent: 50 } as any)).toBe(3000) // under the cap
    expect(carryOverAmount({ ...base, carry_over_mode: 'percent' } as any)).toBe(3000) // no cap set
  })
  it('setBudgetPeriod writes the carry-over mode and cap, preserving them when not patched', async () => {
    vi.spyOn(client, 'getOne').mockResolvedValue({ id: 'x', carry_over_mode: 'full', carry_over_max_percent: 25 } as any)
    const spy = vi.spyOn(client, 'write').mockResolvedValue([{ id: 'x' }] as any)
    await setBudgetPeriod('w', 'u', '2026-08', {
      total_budget: { amount: 1, currency: 'UAH' },
      carry_over_mode: 'percent',
      carry_over_max_percent: 10,
    })
    expect((spy.mock.calls[0][1] as any).carry_over_mode).toBe('percent')
    expect((spy.mock.calls[0][1] as any).carry_over_max_percent).toBe(10)
    await setBudgetPeriod('w', 'u', '2026-08', { total_budget: { amount: 2, currency: 'UAH' } })
    expect((spy.mock.calls[1][1] as any).carry_over_mode).toBe('full') // preserved
    expect((spy.mock.calls[1][1] as any).carry_over_max_percent).toBe(25) // preserved
  })
  it('listBudgetPeriods returns the workspace history newest-first', async () => {
    const spy = vi.spyOn(client, 'get').mockResolvedValue([{ period_key: '2026-08' }] as any)
    await listBudgetPeriods('w')
    const [table, q] = spy.mock.calls[0] as any
    expect(table).toBe('budget_periods')
    expect(q.workspace_id).toBe('eq.w')
    expect(q.order).toBe('period_key.desc')
  })
})
