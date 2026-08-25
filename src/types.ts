export interface Session {
  access_token: string
  refresh_token: string
  expires_at: number // unix seconds
  user: { id: string; email: string }
}
// Multi-currency (2026 update): the ORIGINAL amount of a transaction made in a foreign
// currency. `sum` stays in the ACCOUNT's currency (converted at the transaction date);
// `invoice` keeps what was actually charged. e.g. sum:-224.7 (UAH) / invoice:{sum:-4.99, instrument:'USD'}.
export interface Invoice {
  sum: number
  instrument: string // ISO currency code of the original charge
}
export interface Movement {
  id?: string
  sum: number
  fee: number
  account: { id: string }
  invoice: Invoice | null
  split_from_transaction_id?: string // set on a split "part" — links it to the original
  refunds?: Movement[] // partial returns recorded against this movement
  refunded?: boolean
  status?: string | null // 'scheduled' on installment/planned legs the bank hasn't executed yet
  scheduled_date?: string | null // 'YYYY-MM-DD' planned execution date (matches the tx `time`)
}
// `merchant` grew two fields in the 2026-08 update: a human-readable `title` (the bank's
// merchant name — the only merchant label the API exposes) and `automation`, stamped on
// transactions captured by the Apple Pay Wallet Shortcuts automation.
export interface Merchant {
  mcc?: number | null
  title?: string | null
  automation?: { source?: string; cardLabel?: string; runId?: string; dedupeKey?: string; capturedAtMs?: number } | null
}
export interface Transaction {
  id: string
  created_at?: string
  updated_at: string
  user_id: string
  workspace_id: string
  time: string // unix seconds as string
  description: string | null
  category: string | null // category id
  movements: Movement[]
  hold: boolean
  merchant: Merchant | string | null // bank-set; in practice a Merchant object, not a string
  person: string | null
  frequency: string | null
  recurringId: string | null
  tags: string[] | null
}
export interface Account {
  id: string
  type: string
  name: string
  balance: number
  currency: string
  includeInTotal: boolean
  includeInAnalytics?: boolean
  creditLimit?: number | null
  company: string | null
  syncId?: string | null
  archived: boolean
  emoji: string | null
  goal: number | null
  savings?: boolean
  crypto?: Record<string, { quantity?: number; avg_price?: number }> | null
  stocks?: Record<string, { quantity?: number; avg_price?: number }> | null
  debts?: Record<string, number> | null
  workspace_id: string
  updated_at: string
}
export interface Category {
  id: string
  workspace_id: string
  title: string
  type?: string
  icon?: string | null
  color?: string | null
  budget?: unknown // JSON object in the DB (per-currency/period); treated opaquely by the CLI
  parent?: string | null
  emoji?: string | null
  archived_at?: string | null // set => archived (reversible soft-delete)
  updated_at: string
}
export interface Tag {
  id: string
  workspace_id: string
  name: string
  updated_at: string
}
export interface Workspace {
  id: string
  name: string
  owner_id: string
  is_personal: boolean
}
export interface Membership {
  workspace_id: string
  role: string
  status: string
  workspaces: Workspace
}
export interface Money {
  amount: number
  currency: string
}
// Rollover of the previous period's leftover. Verified empirically against the DB check
// constraint `budget_periods_carry_over_mode_check` — these three are the ONLY accepted values.
// 'percent' caps the rolled-over amount at `carry_over_max_percent` of the period budget.
export const CARRY_OVER_MODES = ['none', 'full', 'percent'] as const
export type CarryOverMode = (typeof CARRY_OVER_MODES)[number]
// New (2026 update) budget model: one row per period; budgets are a single total, not per-category.
export interface BudgetPeriod {
  id: string
  user_id: string
  workspace_id: string
  period_key: string // 'YYYY-MM'
  financial_month_start: number
  total_budget: Money | null
  total_carry_over_applied?: Money | null
  planned_income?: Money | null
  carry_over_mode?: CarryOverMode
  carry_over_max_percent?: number | null
  updated_at?: string
}
export interface WorkspaceSettings {
  workspace_id: string
  main_currency: string
  financial_month_start: number
  show_cents: boolean
}
