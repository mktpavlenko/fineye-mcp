import type { Account } from '../types.js'
import { convert, type RateMap } from './currency.js'
export type CryptoPrices = Record<string, number> // coingecko id -> current price (USD)

// Sum of a debt account's ledger (debts field), e.g. {"UAH": -17000} -> -17000.
export function debtTotal(a: Account): number {
  if (!a.debts) return a.balance
  return Object.values(a.debts).reduce((s, v) => s + (v ?? 0), 0)
}
// Crypto holdings valued at current prices, in USD. When a coin's live price is
// missing, fall back to its avg buy price (cost basis) rather than silently 0.
export function cryptoValueUSD(a: Account, prices: CryptoPrices): number {
  if (!a.crypto) return a.balance
  return Object.entries(a.crypto).reduce((s, [coin, h]) => s + (h?.quantity ?? 0) * (prices[coin] ?? h?.avg_price ?? 0), 0)
}
// Display value + the currency it is expressed in (crypto in USD, debts in ledger currency, else balance).
export function accountValue(a: Account, prices: CryptoPrices): { value: number; currency: string } {
  if (a.type === 'crypto' && a.crypto) return { value: cryptoValueUSD(a, prices), currency: 'USD' }
  if (a.type === 'debt' && a.debts) return { value: debtTotal(a), currency: a.currency }
  return { value: a.balance, currency: a.currency }
}
// Value converted to the workspace main currency.
export function accountValueInMain(a: Account, prices: CryptoPrices, main: string, rates: RateMap): number {
  // Debt ledgers are keyed by currency -> convert each entry by its own currency.
  if (a.type === 'debt' && a.debts) {
    return Object.entries(a.debts).reduce((s, [cur, v]) => {
      try {
        return s + convert(v ?? 0, cur, main, rates)
      } catch {
        return s + (v ?? 0)
      }
    }, 0)
  }
  const { value, currency } = accountValue(a, prices)
  try {
    return convert(value, currency, main, rates)
  } catch {
    return value
  }
}
