import type { Account } from '../types.js'
import { debtTotal } from '../domain/valuation.js'
export type SectionKey = 'goals' | 'banks' | 'cash' | 'savings' | 'stocks' | 'crypto' | 'debts_owed' | 'debts_owe'
export interface SectionMeta {
  key: SectionKey
  label: string
  emoji: string
}
// Display order mirrors the FinEye app sections.
export const SECTION_META: SectionMeta[] = [
  { key: 'goals', label: 'Цілі', emoji: '🎯' },
  { key: 'banks', label: 'Банки', emoji: '🏦' },
  { key: 'cash', label: 'Рахунки та готівка', emoji: '💳' },
  { key: 'savings', label: 'Заощадження', emoji: '📈' },
  { key: 'stocks', label: 'Акції', emoji: '📊' },
  { key: 'crypto', label: 'Крипто', emoji: '₿' },
  { key: 'debts_owed', label: 'Борги: мені винні', emoji: '🤝' },
  { key: 'debts_owe', label: 'Борги: я винен', emoji: '🫰' },
]
export function classifyAccount(a: Account): SectionKey {
  if (a.type === 'goal') return 'goals'
  if (a.type === 'debt') return debtTotal(a) < 0 ? 'debts_owed' : 'debts_owe'
  if (a.savings === true) return 'savings' // savings flag wins over crypto/stocks type (matches app)
  if (a.type === 'crypto') return 'crypto'
  if (a.type === 'stocks') return 'stocks'
  if (a.syncId) return 'banks' // actively bank-connected
  return 'cash'
}
export interface GroupedSection extends SectionMeta {
  accounts: Account[]
}
export function groupAccounts(accounts: Account[]): { sections: GroupedSection[]; flat: Account[] } {
  const buckets = new Map<SectionKey, Account[]>()
  for (const a of accounts) {
    const k = classifyAccount(a)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)!.push(a)
  }
  const sections = SECTION_META.map((m) => ({ ...m, accounts: buckets.get(m.key) ?? [] })).filter((s) => s.accounts.length > 0)
  const flat = sections.flatMap((s) => s.accounts)
  return { sections, flat }
}
