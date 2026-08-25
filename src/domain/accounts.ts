import { randomUUID } from 'node:crypto'
import { get, getOne, patch, write } from '../client.js'
import { ACCOUNT_EDITABLE_FIELDS } from '../constants.js'
import type { Account } from '../types.js'
import { FineyeError } from '../errors.js'
export async function listAccounts(workspaceId: string, includeArchived = false): Promise<Account[]> {
  const rows = await get<Account>('accounts', { select: '*', workspace_id: `eq.${workspaceId}`, order: 'name.asc' })
  return includeArchived ? rows : rows.filter((a) => !a.archived)
}
// Field-restricted edit: only name/emoji/archived ever reach the wire. Never balance/currency/type/bank-link.
export async function editAccount(
  id: string,
  fields: Partial<
    Pick<Account, 'name' | 'emoji' | 'archived' | 'goal' | 'creditLimit' | 'includeInTotal' | 'includeInAnalytics' | 'savings'>
  >,
): Promise<Account> {
  const body: Record<string, unknown> = {}
  for (const k of ACCOUNT_EDITABLE_FIELDS) if (k in fields && (fields as any)[k] !== undefined) body[k] = (fields as any)[k]
  if (Object.keys(body).length === 0) throw new FineyeError('No editable field provided (allowed: name, emoji, archived)', 'invalid')
  body.updated_at = new Date().toISOString()
  const [row] = await patch<Account>('accounts', { id: `eq.${id}` }, body)
  if (!row) throw new FineyeError(`Account not found: ${id}`, 'not_found') // PATCH of 0 rows returns [] (200)
  return row
}
// Create a manual account. RLS requires user_id = auth.uid(). Columns confirmed via live probe.
export async function createAccount(i: {
  workspace_id: string
  user_id: string
  name: string
  type?: string
  currency?: string
  balance?: number
  emoji?: string
  goal?: number
}): Promise<Account> {
  const row = {
    id: randomUUID(),
    workspace_id: i.workspace_id,
    user_id: i.user_id,
    name: i.name,
    type: i.type ?? 'cash',
    currency: i.currency ?? 'UAH',
    balance: i.balance ?? 0,
    emoji: i.emoji ?? null,
    goal: i.goal ?? null,
    includeInTotal: true,
    includeInAnalytics: true,
    archived: false,
    savings: false,
    updated_at: new Date().toISOString(),
  }
  const [saved] = await write<Account>('accounts', row)
  return saved
}
// Holdings: set or remove (h=null) one entry in the account's crypto/stocks map.
// Reads the current map, mutates the single key, PATCHes only that field.
export async function setHolding(
  accountId: string,
  kind: 'crypto' | 'stocks',
  symbol: string,
  h: { quantity: number; avg_price?: number | null } | null,
): Promise<Account> {
  const acc = await getOne<Account>('accounts', { select: '*', id: `eq.${accountId}` })
  if (!acc) throw new FineyeError(`Account not found: ${accountId}`, 'not_found')
  const map: Record<string, { quantity?: number; avg_price?: number | null }> = { ...((acc[kind] as any) ?? {}) }
  if (h === null) delete map[symbol]
  else map[symbol] = { quantity: h.quantity, avg_price: h.avg_price ?? map[symbol]?.avg_price ?? null }
  const [row] = await patch<Account>('accounts', { id: `eq.${accountId}` }, { [kind]: map })
  if (!row) throw new FineyeError(`Account not found: ${accountId}`, 'not_found')
  return row
}
// Debt ledger: set or remove (amount=null) the amount owed in a given currency on a debt account.
export async function setDebt(accountId: string, currency: string, amount: number | null): Promise<Account> {
  const acc = await getOne<Account>('accounts', { select: '*', id: `eq.${accountId}` })
  if (!acc) throw new FineyeError(`Account not found: ${accountId}`, 'not_found')
  const map: Record<string, number> = { ...((acc.debts as any) ?? {}) }
  if (amount === null) delete map[currency]
  else map[currency] = amount
  const [row] = await patch<Account>('accounts', { id: `eq.${accountId}` }, { debts: map })
  if (!row) throw new FineyeError(`Account not found: ${accountId}`, 'not_found')
  return row
}
export async function resolveAccount(workspaceId: string, nameOrId: string): Promise<Account> {
  const all = await listAccounts(workspaceId, true)
  const hit = all.find((a) => a.id === nameOrId) ?? all.find((a) => a.name.toLowerCase() === nameOrId.toLowerCase())
  if (!hit) throw new FineyeError(`Account not found: ${nameOrId}`, 'not_found')
  return hit
}
