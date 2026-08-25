import { randomUUID } from 'node:crypto'
import { getOne, write } from '../client.js'
import { get } from '../client.js'
import type { BudgetPeriod, CarryOverMode, Money } from '../types.js'

// The 2026 FinEye update moved budgets from per-category (categories.budget, now deprecated/null)
// to a single TOTAL per period, stored in the budget_periods table (period_key = 'YYYY-MM').
export async function getBudgetPeriod(workspaceId: string, periodKey: string): Promise<BudgetPeriod | null> {
  return getOne<BudgetPeriod>('budget_periods', {
    select: '*',
    workspace_id: `eq.${workspaceId}`,
    period_key: `eq.${periodKey}`,
  })
}
// Budget history: every period the workspace has ever budgeted, newest first.
export async function listBudgetPeriods(workspaceId: string): Promise<BudgetPeriod[]> {
  return get<BudgetPeriod>('budget_periods', {
    select: '*',
    workspace_id: `eq.${workspaceId}`,
    order: 'period_key.desc',
  })
}
// The leftover the app rolls into a period. 'none' -> 0; 'full' -> whatever was carried;
// 'percent' -> capped at carry_over_max_percent of that period's budget. The rollover is
// COMPUTED BY THE APP and stored in total_carry_over_applied; the CLI reports it, never invents it.
export function carryOverAmount(bp: BudgetPeriod | null): number {
  if (!bp || (bp.carry_over_mode ?? 'none') === 'none') return 0
  const applied = bp.total_carry_over_applied?.amount ?? 0
  if (bp.carry_over_mode !== 'percent' || bp.carry_over_max_percent == null) return applied
  const cap = ((bp.total_budget?.amount ?? 0) * bp.carry_over_max_percent) / 100
  return Math.min(applied, cap)
}
// Upsert a period's budget, preserving existing carry-over settings. RLS requires user_id.
export async function setBudgetPeriod(
  workspaceId: string,
  userId: string,
  periodKey: string,
  patch: {
    total_budget?: Money
    planned_income?: Money | null
    financial_month_start?: number
    carry_over_mode?: CarryOverMode
    carry_over_max_percent?: number | null
  },
): Promise<BudgetPeriod> {
  const existing = await getBudgetPeriod(workspaceId, periodKey)
  const row = {
    id: existing?.id ?? randomUUID(),
    user_id: userId,
    workspace_id: workspaceId,
    period_key: periodKey,
    financial_month_start: patch.financial_month_start ?? existing?.financial_month_start ?? 1,
    total_budget: patch.total_budget ?? existing?.total_budget ?? null,
    total_carry_over_applied: existing?.total_carry_over_applied ?? null,
    planned_income: patch.planned_income !== undefined ? patch.planned_income : (existing?.planned_income ?? null),
    carry_over_mode: patch.carry_over_mode ?? existing?.carry_over_mode ?? 'none',
    carry_over_max_percent:
      patch.carry_over_max_percent !== undefined ? patch.carry_over_max_percent : (existing?.carry_over_max_percent ?? null),
    updated_at: new Date().toISOString(),
  }
  const [saved] = await write<BudgetPeriod>('budget_periods', row)
  return saved
}
