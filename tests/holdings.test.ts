import { it, expect } from 'vitest'
import { holdings } from '../src/domain/holdings.js'
it('values each holding + P&L vs avg price; skips zero qty', () => {
  const acc = { type: 'crypto', crypto: { bitcoin: { quantity: 2, avg_price: 50 }, ethereum: { quantity: 0 } } } as any
  const r = holdings(acc, { bitcoin: 100, ethereum: 10 })
  const btc = r.find((h) => h.symbol === 'bitcoin')!
  expect(btc.value).toBe(200)
  expect(btc.costBasis).toBe(100)
  expect(btc.pnl).toBe(100)
  expect(btc.pnlPct).toBeCloseTo(100, 1)
  expect(r.find((h) => h.symbol === 'ethereum')).toBeUndefined()
})
it('uses avg_price (cost basis) when a live price is missing, e.g. stocks', () => {
  const acc = { type: 'stocks', stocks: { AAPL: { quantity: 10, avg_price: 150 } } } as any
  const aapl = holdings(acc, {}).find((h) => h.symbol === 'AAPL')!
  expect(aapl.price).toBe(150)
  expect(aapl.value).toBe(1500)
  expect(aapl.pnl).toBe(0)
  // …and says so, so the caller does not render that 0 as a real break-even
  expect(aapl.estimated).toBe(true)
})
it('marks a holding as estimated only when no live price exists', () => {
  const acc = { type: 'crypto', crypto: { bitcoin: { quantity: 1, avg_price: 50 } } } as any
  expect(holdings(acc, { bitcoin: 100 })[0].estimated).toBe(false)
  expect(holdings(acc, {})[0].estimated).toBe(true)
})
