import { it, expect } from 'vitest'
import { computeNetWorth } from '../src/domain/networth.js'
it('sums accounts converted to main currency, honoring includeInTotal', () => {
  const accts = [
    { balance: 100, currency: 'UAH', includeInTotal: true },
    { balance: 10, currency: 'USD', includeInTotal: true },
    { balance: 999, currency: 'UAH', includeInTotal: false },
  ] as any
  const total = computeNetWorth(accts, 'UAH', { UAH: 1, USD: 41 })
  expect(total).toBeCloseTo(100 + 410)
})
