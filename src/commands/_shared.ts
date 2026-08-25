import { loadSession } from '../auth/tokenStore.js'
import { getOne } from '../client.js'
import { resolveWorkspaceId } from '../domain/workspaces.js'
import { listAccounts } from '../domain/accounts.js'
import { fetchRates, safeConvert, type RateMap } from '../domain/currency.js'
import { normalizeToMain } from '../domain/analytics.js'
import type { Session, Transaction, WorkspaceSettings } from '../types.js'
import { FineyeError } from '../errors.js'
export function requireSession(): Session {
  const s = loadSession()
  if (!s) throw new FineyeError('Not logged in. Run: fineye login', 'auth')
  return s
}
export async function requireWorkspace(): Promise<{ session: Session; workspaceId: string }> {
  const session = requireSession()
  const workspaceId = await resolveWorkspaceId(session.user.id)
  return { session, workspaceId }
}
// Everything needed to restate transactions in the workspace main currency. Shared by the
// spend aggregates (analytics, budget) so a multi-currency workspace doesn't add UAH to USD.
export async function fxContext(workspaceId: string): Promise<{
  main: string
  financialMonthStart: number
  rates: RateMap
  toMain: (tx: Transaction[]) => Transaction[]
  fromMain: (n: number, to: string) => number
}> {
  const [settings, accts, rates] = await Promise.all([
    getOne<WorkspaceSettings>('workspace_settings', { workspace_id: `eq.${workspaceId}`, select: '*' }),
    listAccounts(workspaceId),
    fetchRates(),
  ])
  const main = settings?.main_currency ?? 'UAH'
  const byId = new Map(accts.map((a) => [a.id, a.currency]))
  return {
    main,
    financialMonthStart: settings?.financial_month_start ?? 1,
    rates,
    toMain: (tx) => normalizeToMain(tx, byId, main, rates),
    // A budget can be denominated in a currency other than the workspace main one — restate a
    // main-currency total into it so budget and spend are never compared across currencies.
    fromMain: (n, to) => safeConvert(n, main, to, rates),
  }
}
