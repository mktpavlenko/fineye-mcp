import { it, expect } from 'vitest'
import { classifyAccount, groupAccounts } from '../src/tui/sections.js'
const A = (over: any) => ({ id: Math.random().toString(), type: 'ccard', savings: false, balance: 0, currency: 'UAH', ...over }) as any
it('classifies accounts into sections', () => {
  expect(classifyAccount(A({ type: 'goal' }))).toBe('goals')
  expect(classifyAccount(A({ type: 'ccard', syncId: 'x', company: 'monobank' }))).toBe('banks')
  expect(classifyAccount(A({ type: 'ccard' }))).toBe('cash')
  expect(classifyAccount(A({ type: 'ccard', savings: true }))).toBe('savings')
  expect(classifyAccount(A({ type: 'crypto', savings: true }))).toBe('savings') // savings flag wins
  expect(classifyAccount(A({ type: 'crypto' }))).toBe('crypto')
  expect(classifyAccount(A({ type: 'debt', debts: { UAH: -17000 } }))).toBe('debts_owed')
  expect(classifyAccount(A({ type: 'debt', debts: { UAH: 5000 } }))).toBe('debts_owe')
})
it('groups + flattens in section order, skipping empty', () => {
  const accts = [A({ type: 'cash', name: 'Cash' }), A({ type: 'goal', name: 'Goal' }), A({ type: 'ccard', syncId: 's', name: 'mono' })]
  const { sections, flat } = groupAccounts(accts)
  expect(sections.map((s) => s.key)).toEqual(['goals', 'banks', 'cash'])
  expect(flat.map((a: any) => a.name)).toEqual(['Goal', 'mono', 'Cash'])
})
