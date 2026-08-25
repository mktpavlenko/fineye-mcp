import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { getOne } from '../client.js'
import { listAccounts } from '../domain/accounts.js'
import { fetchRates, fetchCryptoPrices } from '../domain/currency.js'
import { computeNetWorth, fetchNetWorthSeries } from '../domain/networth.js'
import type { WorkspaceSettings } from '../types.js'
export const networthCmd = new Command('networth')
  .description('Net worth in main currency')
  .option('--history', 'show 30-day net worth trend')
  .option('--json')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const [settings, rates, prices, accts] = await Promise.all([
      getOne<WorkspaceSettings>('workspace_settings', { workspace_id: `eq.${workspaceId}`, select: '*' }),
      fetchRates(),
      fetchCryptoPrices(),
      listAccounts(workspaceId),
    ])
    const main = settings?.main_currency ?? 'UAH'
    if (o.history) {
      const includeIds = new Set(accts.filter((a) => a.includeInTotal).map((a) => a.id))
      const series = await fetchNetWorthSeries(workspaceId, main, rates, prices, 30, includeIds)
      if (o.json) console.log(JSON.stringify({ main_currency: main, series }, null, 2))
      else console.log(series.map((v) => `${Math.round(v)} ${main}`).join('\n'))
      return
    }
    const total = computeNetWorth(accts, main, rates, prices)
    if (o.json) console.log(JSON.stringify({ main_currency: main, net_worth: Number(total.toFixed(2)) }, null, 2))
    else console.log(`Net worth: ${total.toFixed(2)} ${main}`)
  })
