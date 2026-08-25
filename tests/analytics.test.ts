import { it, expect } from 'vitest'
import {
  spendByCategory,
  spendByTag,
  spendByMerchant,
  merchantName,
  normalizeToMain,
  totals,
  avgPerDay,
  monthRange,
} from '../src/domain/analytics.js'

it('spendByTag sums expenses per tag (a multi-tag tx counts in each), income excluded', () => {
  const tx = [
    { tags: ['t1', 't2'], movements: [{ sum: -100 }] },
    { tags: ['t1'], movements: [{ sum: -50 }] },
    { tags: ['t1'], movements: [{ sum: 200 }] }, // income — excluded
    { tags: null, movements: [{ sum: -10 }] },
  ] as any
  const r = spendByTag(tx)
  expect(r.t1).toBe(-150)
  expect(r.t2).toBe(-100)
})
it('monthRange validates the month format', () => {
  // `to` = LAST day of the month (inclusive end-of-day in listTransactions), not first of next
  expect(monthRange('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  expect(monthRange()).toEqual({})
  expect(() => monthRange('garbage')).toThrow(/invalid month/i)
  expect(() => monthRange('2026-13')).toThrow(/invalid month/i)
})
it('sums single-leg movements per category and EXCLUDES transfers', () => {
  const tx = [
    { category: 'food', movements: [{ sum: -100, account: { id: 'a' } }] },
    { category: 'food', movements: [{ sum: -50, account: { id: 'a' } }] },
    { category: 'pay', movements: [{ sum: 200, account: { id: 'a' } }] },
    {
      category: null,
      movements: [
        { sum: -145, account: { id: 'a' } },
        { sum: 145, account: { id: 'b' } },
      ],
    },
  ] as any
  const r = spendByCategory(tx)
  expect(r.food).toBe(-150)
  expect(r.pay).toBe(200)
  expect(Object.values(r)).not.toContain(0)
})
it('totals split income/expense/net (single-leg only)', () => {
  const tx = [
    { movements: [{ sum: -100 }] },
    { movements: [{ sum: -50 }] },
    { movements: [{ sum: 200 }] },
    { movements: [{ sum: -10 }, { sum: 10 }] },
  ] as any
  expect(totals(tx)).toEqual({ income: 200, expense: 150, net: 50 })
})
it('avgPerDay divides expense by days', () => {
  expect(avgPerDay([{ movements: [{ sum: -300 }] }] as any, 3)).toBe(100)
})
it('scheduled (installment) movements are excluded from every aggregate', () => {
  const tx = [
    { category: 'food', tags: ['t1'], movements: [{ sum: -100, account: { id: 'a' } }] },
    { category: 'food', tags: ['t1'], movements: [{ sum: -999, account: { id: 'a' }, status: 'scheduled', scheduled_date: '2027-01-31' }] },
  ] as any
  expect(spendByCategory(tx)).toEqual({ food: -100 })
  expect(spendByTag(tx)).toEqual({ t1: -100 })
  expect(totals(tx)).toEqual({ income: 0, expense: 100, net: -100 })
})
it('split parts reduce the original so spend is not double-counted', () => {
  const tx = [
    { id: 'orig', category: 'a', movements: [{ sum: -100, account: { id: 'x' } }] },
    { id: 'part', category: 'b', movements: [{ sum: -20, account: { id: 'x' }, split_from_transaction_id: 'orig' }] },
  ] as any
  const r = spendByCategory(tx)
  expect(r.a).toBe(-80) // original reduced by the carved-out part
  expect(r.b).toBe(-20)
  expect(totals(tx).expense).toBe(100) // not 120
})
it('spendByMerchant groups by merchant.title, falls back to description, expenses only', () => {
  const tx = [
    { id: '1', merchant: { mcc: 5411, title: 'Крамниця' }, description: 'card tx', movements: [{ sum: -100, account: { id: 'a' } }] },
    { id: '2', merchant: { mcc: 5411, title: 'Крамниця' }, description: null, movements: [{ sum: -50, account: { id: 'a' } }] },
    { id: '3', merchant: null, description: 'готівка', movements: [{ sum: -30, account: { id: 'a' } }] },
    { id: '4', merchant: { title: 'Зарплата' }, description: null, movements: [{ sum: 900, account: { id: 'a' } }] }, // income — excluded
    { id: '5', merchant: null, description: null, movements: [{ sum: -7, account: { id: 'a' } }] },
  ] as any
  const r = spendByMerchant(tx)
  expect(r['Крамниця']).toBe(-150)
  expect(r['готівка']).toBe(-30)
  expect(r['(no merchant)']).toBe(-7)
  expect(r['Зарплата']).toBeUndefined()
})
it('merchantName prefers the bank title over the description', () => {
  expect(merchantName({ merchant: { title: 'Bolt' }, description: 'ride' } as any)).toBe('Bolt')
  expect(merchantName({ merchant: { mcc: 5411 }, description: 'ride' } as any)).toBe('ride')
  expect(merchantName({ merchant: 'legacy-string', description: null } as any)).toBe('(no merchant)')
})
it('normalizeToMain restates foreign-currency legs before aggregating', () => {
  // rates are "1 unit of X in the common base": 1 USD = 1 base, 1 UAH = 0.02 base -> 1 USD = 50 UAH
  const rates = { USD: 1, UAH: 0.02, EUR: 1.16 }
  const acct = new Map([
    ['uah', 'UAH'],
    ['usd', 'USD'],
  ])
  const tx = [
    { id: '1', category: 'c', movements: [{ sum: -100, fee: 0, account: { id: 'uah' } }] },
    { id: '2', category: 'c', movements: [{ sum: -10, fee: 1, account: { id: 'usd' } }] },
    { id: '3', category: 'c', movements: [{ sum: -5, fee: 0, account: { id: 'unknown-account' } }] },
  ] as any
  const n = normalizeToMain(tx, acct, 'UAH', rates)
  expect(n[0].movements[0].sum).toBe(-100) // already main
  expect(n[1].movements[0].sum).toBe(-500) // 10 USD -> 500 UAH
  expect(n[1].movements[0].fee).toBe(50)
  expect(n[2].movements[0].sum).toBe(-5) // unknown account -> left untouched, never dropped
  expect(totals(n).expense).toBe(605)
  expect(tx[1].movements[0].sum).toBe(-10) // input not mutated
})
it('normalizeToMain leaves a leg alone when the rate is missing', () => {
  const n = normalizeToMain([{ id: '1', movements: [{ sum: -10, fee: 0, account: { id: 'x' } }] }] as any, new Map([['x', 'XYZ']]), 'UAH', {
    UAH: 0.02,
  })
  expect(n[0].movements[0].sum).toBe(-10)
})
