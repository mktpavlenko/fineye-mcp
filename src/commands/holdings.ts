import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { listAccounts, resolveAccount } from '../domain/accounts.js'
import { fetchCryptoPrices } from '../domain/currency.js'
import { holdings } from '../domain/holdings.js'
import { output } from '../render.js'
import { FineyeError } from '../errors.js'
export const holdingsCmd = new Command('holdings')
  .description('Crypto / stocks holdings breakdown with P&L')
  .argument('[account]', 'account name or id (defaults to first crypto/stocks account)')
  .option('--json')
  .action(async (account, o) => {
    const { workspaceId } = await requireWorkspace()
    const accts = await listAccounts(workspaceId, true)
    const acc = account ? await resolveAccount(workspaceId, account) : accts.find((a) => a.type === 'crypto' || a.type === 'stocks')
    if (!acc) throw new FineyeError('No crypto/stocks account found', 'invalid')
    const prices = await fetchCryptoPrices()
    const rows = holdings(acc, prices)
    if (o.json) {
      // P&L on an estimated row would be a fabricated 0 — send null so a consumer can't sum it.
      console.log(
        JSON.stringify({ account: acc.name, holdings: rows.map((h) => (h.estimated ? { ...h, pnl: null, pnlPct: null } : h)) }, null, 2),
      )
      return
    }
    console.log(`Holdings · ${acc.name}`)
    output(
      rows.map((h) => ({
        asset: h.symbol,
        qty: h.quantity,
        price: Number(h.price.toFixed(2)),
        value: Number(h.value.toFixed(2)),
        pnl: h.estimated ? '—' : Number(h.pnl.toFixed(2)),
        'pnl%': h.estimated ? '—' : `${h.pnlPct.toFixed(1)}%`,
      })),
      false,
      ['asset', 'qty', 'price', 'value', 'pnl', 'pnl%'],
    )
    if (rows.some((h) => h.estimated))
      console.log('— = no market price available (the backend publishes prices for crypto only); valued at the average buy price')
  })
