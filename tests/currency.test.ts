import { it, expect, describe, vi, beforeEach, afterEach } from 'vitest'
import * as client from '../src/client.js'
import { convert, safeConvert, fetchRates, resetRateCache } from '../src/domain/currency.js'

beforeEach(resetRateCache)
afterEach(() => vi.restoreAllMocks())
it('converts via rate map to main currency', () => {
  const rates = { UAH: 1, USD: 41 } // 1 USD = 41 UAH
  expect(convert(10, 'USD', 'UAH', rates)).toBeCloseTo(410)
  expect(convert(41, 'UAH', 'USD', rates)).toBeCloseTo(1)
  expect(convert(5, 'UAH', 'UAH', rates)).toBe(5)
})
it('safeConvert falls back to the input when a rate is missing', () => {
  expect(safeConvert(100, 'USD', 'UAH', { USD: 1, UAH: 0.02 })).toBe(5000)
  expect(safeConvert(100, 'UAH', 'UAH', { UAH: 0.02 })).toBe(100)
  expect(safeConvert(100, 'XYZ', 'UAH', { UAH: 0.02 })).toBe(100) // unknown -> unchanged, never throws
})

describe('rate cache', () => {
  it('hits the database once per TTL window, not once per caller', async () => {
    const spy = vi.spyOn(client, 'get').mockResolvedValue([{ fiat: { rates: { UAH: 52, EUR: 1 } } }] as any)
    await fetchRates()
    await fetchRates()
    await fetchRates()
    expect(spy).toHaveBeenCalledTimes(1)
  })
  it('resetRateCache forces the next call back to the database', async () => {
    const spy = vi.spyOn(client, 'get').mockResolvedValue([{ fiat: { rates: { UAH: 52 } } }] as any)
    await fetchRates()
    resetRateCache()
    await fetchRates()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
