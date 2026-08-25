import { it, expect } from 'vitest'
import { cryptoValueUSD, debtTotal, accountValue, accountValueInMain } from '../src/domain/valuation.js'
it('cryptoValueUSD falls back to avg_price when live price is missing', () => {
  const a = { type: 'crypto', balance: 0, currency: 'USD', crypto: { foo: { quantity: 2, avg_price: 10 } } } as any
  expect(cryptoValueUSD(a, {})).toBe(20) // no live price -> 2 * avg_price (cost basis), not 0
})
it('accountValueInMain converts a multi-currency debt ledger per entry', () => {
  const a = { type: 'debt', balance: 0, currency: 'UAH', debts: { UAH: -100, USD: -10 } } as any
  const rates = { UAH: 1, USD: 40 } // value of 1 unit in a common base
  expect(accountValueInMain(a, {}, 'UAH', rates)).toBeCloseTo(-500, 2) // -100 UAH + (-10 USD -> -400 UAH)
})
it('crypto valued at current prices (USD)', () => {
  const a = {
    type: 'crypto',
    balance: 99,
    currency: 'USD',
    crypto: { bitcoin: { quantity: 0.001399 }, ethereum: { quantity: 0.1818 } },
  } as any
  expect(cryptoValueUSD(a, { bitcoin: 66383, ethereum: 1813.35 })).toBeCloseTo(0.001399 * 66383 + 0.1818 * 1813.35, 2)
})
it('debt total comes from the ledger, not balance', () => {
  expect(debtTotal({ debts: { UAH: -17000 }, balance: -25000 } as any)).toBe(-17000)
})
it('accountValue: crypto USD, debt ledger, else balance', () => {
  expect(
    accountValue({ type: 'crypto', balance: 9, currency: 'USD', crypto: { bitcoin: { quantity: 2 } } } as any, { bitcoin: 100 }),
  ).toEqual({ value: 200, currency: 'USD' })
  expect(accountValue({ type: 'debt', balance: -25000, currency: 'UAH', debts: { UAH: -17000 } } as any, {})).toEqual({
    value: -17000,
    currency: 'UAH',
  })
  expect(accountValue({ type: 'ccard', balance: 50, currency: 'UAH' } as any, {})).toEqual({ value: 50, currency: 'UAH' })
})
