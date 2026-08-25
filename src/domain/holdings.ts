import type { Account } from '../types.js'
import type { CryptoPrices } from './valuation.js'
export interface HoldingRow {
  symbol: string
  quantity: number
  price: number
  value: number
  costBasis: number
  pnl: number
  pnlPct: number
  /** No live market price for this symbol — `price` is the average buy price, so P&L is unknowable,
   *  not zero. The backend publishes prices for crypto only, so this is always true for stocks. */
  estimated: boolean
}
export function holdings(a: Account, prices: CryptoPrices): HoldingRow[] {
  const src = (a.crypto ?? a.stocks ?? {}) as Record<string, { quantity?: number; avg_price?: number }>
  const rows: HoldingRow[] = []
  for (const [symbol, h] of Object.entries(src)) {
    const qty = h?.quantity ?? 0
    if (!qty) continue
    const live = prices[symbol]
    const price = live ?? h?.avg_price ?? 0 // no live price (e.g. stocks) -> show cost basis, not 0/-100%
    const value = qty * price
    const costBasis = qty * (h?.avg_price ?? 0)
    const pnl = value - costBasis
    rows.push({
      symbol,
      quantity: qty,
      price,
      value,
      costBasis,
      pnl,
      pnlPct: costBasis ? (pnl / costBasis) * 100 : 0,
      estimated: live == null,
    })
  }
  return rows.sort((a, b) => b.value - a.value)
}
