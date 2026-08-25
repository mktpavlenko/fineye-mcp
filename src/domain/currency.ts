import { get } from '../client.js'
import { FineyeError } from '../errors.js'
export type RateMap = Record<string, number> // currency -> value in a common base
export function convert(amount: number, from: string, to: string, rates: RateMap): number {
  if (from === to) return amount
  const rf = rates[from]
  const rt = rates[to]
  if (!rf || !rt) throw new FineyeError(`Missing rate for ${from} or ${to}`, 'invalid')
  return amount * (rf / rt)
}
// Same conversion, but a missing rate leaves the amount alone instead of throwing — for
// display paths where one unknown currency must not take the whole screen down.
export function safeConvert(amount: number, from: string, to: string, rates: RateMap): number {
  try {
    return convert(amount, from, to, rates)
  } catch {
    return amount
  }
}
// Rates and prices change slowly and every analytics/budget/net-worth call needs them. In a
// one-shot CLI run that was one query; in the long-lived MCP server it is the same query dozens of
// times an hour. Five minutes is well inside the accuracy these numbers ever claim.
const TTL_MS = 5 * 60_000
let pricesCache: { at: number; v: Record<string, number> } | null = null
let ratesCache: { at: number; v: RateMap } | null = null
export function resetRateCache(): void {
  pricesCache = null
  ratesCache = null
}
export async function fetchCryptoPrices(): Promise<Record<string, number>> {
  if (pricesCache && Date.now() - pricesCache.at < TTL_MS) return pricesCache.v
  // currency_rates.crypto = [{ id:'bitcoin', current_price: 66383, ... }, ...] (prices in USD)
  const rows = await get<{ crypto?: Array<{ id: string; current_price?: number }> }>('currency_rates', { select: 'crypto', limit: '1' })
  const map: Record<string, number> = {}
  for (const c of rows[0]?.crypto ?? []) if (c.id && typeof c.current_price === 'number') map[c.id] = c.current_price
  pricesCache = { at: Date.now(), v: map }
  return map
}
export async function fetchRates(): Promise<RateMap> {
  if (ratesCache && Date.now() - ratesCache.at < TTL_MS) return ratesCache.v
  // currency_rates.fiat = { base:'EUR', rates: { UAH: 52.0, USD: 1.16, EUR: 1, ... } } where rates[X] = X per 1 EUR.
  // RateMap holds value of 1 unit of X in the common base (EUR): map[X] = 1 / rates[X].
  const rows = await get<{ fiat?: { rates?: Record<string, number> } }>('currency_rates', { select: 'fiat', limit: '1' })
  const rates = rows[0]?.fiat?.rates ?? {}
  const map: RateMap = {}
  for (const [cur, perEur] of Object.entries(rates)) if (typeof perEur === 'number' && perEur > 0) map[cur] = 1 / perEur
  ratesCache = { at: Date.now(), v: map }
  return map
}
