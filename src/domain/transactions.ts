import { randomUUID } from 'node:crypto'
import { get, getOne, write, patch, del } from '../client.js'
import type { Transaction, Movement } from '../types.js'
import { parseDateToUnix } from '../util.js'
import { SCAN_LIMIT, type Warn } from '../warn.js'
import { FineyeError } from '../errors.js'

// ---- Read ----
export interface TxFilters {
  from?: string
  to?: string
  account?: string
  category?: string
  search?: string
  limit?: number
  offset?: number
}
// `warn` defaults to silence: this is a library function, and a programmatic caller wants the
// message as data (see src/warn.ts), not on someone's terminal.
export async function listTransactions(workspaceId: string, f: TxFilters = {}, warn: Warn = () => {}): Promise<Transaction[]> {
  const q: Record<string, string> = { select: '*', workspace_id: `eq.${workspaceId}`, order: 'time.desc' }
  const bounds: string[] = [] // two bounds on one column -> single and=() group
  if (f.from) bounds.push(`time.gte.${parseDateToUnix(f.from)}`)
  // `--to <day>` is inclusive of the WHOLE day: bound at the start of the next day.
  if (f.to) bounds.push(`time.lt.${parseDateToUnix(f.to) + 86400}`)
  if (bounds.length) q['and'] = `(${bounds.join(',')})`
  if (f.category) q['category'] = `eq.${f.category}`
  if (f.search) q['description'] = `ilike.*${f.search}*`
  // The `account` lives inside the movements jsonb and PostgREST can't filter it (movements is array-typed).
  // So when filtering by account, fetch a wide set, filter in memory, THEN apply limit/offset on the filtered rows.
  if (f.account) {
    // The scan has to be at least as wide as what the caller asked for, or a bulk operation
    // requesting everything would silently act on the 5000 most recent rows only.
    const scan = Math.max(5000, f.limit ?? 0)
    q['limit'] = String(scan)
    const raw = await get<Transaction>('transactions', q)
    if (raw.length >= scan)
      warn(`--account scanned only the ${scan} most recent transactions; older matches may be missing (narrow with --from/--to)`)
    const all = raw.filter((t) => t.movements.some((m) => m.account.id === f.account))
    const offset = f.offset ?? 0
    return all.slice(offset, offset + (f.limit ?? 100))
  }
  const limit = f.limit ?? 100
  q['limit'] = String(limit)
  if (f.offset) q['offset'] = String(f.offset)
  const rows = await get<Transaction>('transactions', q)
  // Only for scan-everything reads: hitting the cap there means a total is probably wrong, not
  // just a shorter list. A paginated read hitting its own page size is normal, so it stays quiet.
  if (limit >= SCAN_LIMIT && rows.length >= limit)
    warn(`the result hit the ${limit}-row cap — totals may be incomplete (narrow --from/--to)`)
  return rows
}

// Fetch ONE transaction directly by id (scoped to the workspace). Direct lookup —
// not a scan of the recent N — so an old id resolves instead of a misleading
// "not found in recent set". Returns null only when the id truly doesn't exist.
export async function getTransactionById(workspaceId: string, id: string): Promise<Transaction | null> {
  return getOne<Transaction>('transactions', { select: '*', workspace_id: `eq.${workspaceId}`, id: `eq.${id}` })
}

export type TxType = 'expense' | 'income' | 'transfer'
// Derive the kind from the legs the same way the app does: 2+ legs = transfer
// (opposite-sign pair), single leg = expense (negative) or income (positive).
// The app IGNORES the stored `category` on transfers, so consumers should too.
export function txType(t: Pick<Transaction, 'movements'>): TxType {
  if (t.movements.length !== 1) return 'transfer'
  return t.movements[0].sum < 0 ? 'expense' : 'income'
}

// A transfer moves money between the user's own accounts, so a SPENDING category on one is
// meaningless — and it poisons any consumer that groups by category instead of by type. The app
// stopped categorizing transfers and 455 historical rows were backfilled to null; this is what
// stops them coming back one edit at a time. `bulk recategorize` filters transfers out of its
// set; every other path that sets a category routes through here.
export function assertCategorizable(t: Pick<Transaction, 'movements'>, categoryId: string | null | undefined): void {
  if (categoryId != null && txType(t) === 'transfer')
    throw new FineyeError(
      'Refusing to put a spending category on a transfer — a transfer moves money between your own accounts, so it is neither income nor spending. Clear it instead if the app left one on.',
      'invalid',
    )
}

// A scheduled (installment/planned) leg is a future payment the bank has NOT executed
// yet — its tx carries a future `time` and must not count as actual spend.
export function isScheduled(t: Pick<Transaction, 'movements'>): boolean {
  return t.movements.some((m) => m.status === 'scheduled')
}

export type SerializedTx = Omit<Transaction, 'person'> & { type: TxType; scheduled: boolean }
// The single machine-facing shape: the raw row + a derived canonical `type`.
// One exception to verbatim passthrough: `person` is DROPPED — it is a sparse,
// opaque counterparty id with no reachable name store (almost never populated),
// so it is noise for the agent. Everything else (incl. raw `category`, `merchant`)
// is preserved; consumers gate spend analytics on `type === 'expense'`.
export function serializeTx(t: Transaction): SerializedTx {
  const { person, ...rest } = t
  void person // intentionally omitted from the agent shape
  return { ...rest, type: txType(t), scheduled: isScheduled(t) }
}

// ---- Build (pure) ----
export interface TxCtx {
  workspaceId: string
  userId: string
  now?: number
}
function base(ctx: TxCtx, time: number, description: string | null, category: string | null): Omit<Transaction, 'movements'> {
  return {
    id: randomUUID(),
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    time: String(time),
    description,
    category,
    hold: false,
    merchant: null,
    person: null,
    frequency: null,
    recurringId: null,
    tags: null,
    updated_at: new Date((ctx.now ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  }
}
function pos(n: number) {
  if (!(n > 0)) throw new FineyeError('amount must be positive', 'invalid')
  return n
}
export function buildExpense(
  i: { amount: number; accountId: string; description?: string; categoryId?: string; date?: number; fee?: number },
  ctx: TxCtx,
): Transaction {
  return {
    ...base(ctx, i.date ?? ctx.now ?? Math.floor(Date.now() / 1000), i.description ?? null, i.categoryId ?? null),
    movements: [{ sum: -pos(i.amount), fee: i.fee ?? 0, account: { id: i.accountId }, invoice: null }],
  }
}
export function buildIncome(
  i: { amount: number; accountId: string; description?: string; categoryId?: string; date?: number; fee?: number },
  ctx: TxCtx,
): Transaction {
  return {
    ...base(ctx, i.date ?? ctx.now ?? Math.floor(Date.now() / 1000), i.description ?? null, i.categoryId ?? null),
    movements: [{ sum: pos(i.amount), fee: i.fee ?? 0, account: { id: i.accountId }, invoice: null }],
  }
}
// `toAmount` lets the destination leg differ from the source leg — needed when the two accounts
// are in different currencies. Default: both legs get the same magnitude, which is what the app
// itself writes for a manual cross-currency transfer (verified against 22 app-created rows), so
// omitting it stays faithful rather than guessing at a rate.
export function buildTransfer(
  i: { amount: number; fromId: string; toId: string; toAmount?: number; fee?: number; description?: string; date?: number },
  ctx: TxCtx,
): Transaction {
  const a = pos(i.amount)
  const b = i.toAmount == null ? a : pos(i.toAmount)
  return {
    ...base(ctx, i.date ?? ctx.now ?? Math.floor(Date.now() / 1000), i.description ?? null, null),
    movements: [
      { sum: -a, fee: i.fee ?? 0, account: { id: i.fromId }, invoice: null },
      { sum: b, fee: 0, account: { id: i.toId }, invoice: null },
    ],
  }
}

// ---- Persist ----
export async function saveTransaction(t: Transaction): Promise<Transaction> {
  const [row] = await write<Transaction>('transactions', t)
  return row
}
export async function editTransaction(id: string, fields: Partial<Transaction>): Promise<Transaction> {
  const body = { ...fields, updated_at: new Date().toISOString() }
  const [row] = await patch<Transaction>('transactions', { id: `eq.${id}` }, body)
  if (!row) throw new FineyeError(`Transaction not found: ${id}`, 'not_found') // PATCH of 0 rows returns [] (200), not 404
  return row
}
// Hard delete (irreversible) — gated by the client (FINEYE_DELETE + allow-list).
export async function deleteTransaction(id: string): Promise<void> {
  await del('transactions', { id: `eq.${id}` })
}

// Duplicate a transaction into a fresh, independent entry (new id, today's date unless given).
// Drops split/refund links and movement ids — the copy stands on its own.
export function duplicateTransaction(orig: Transaction, ctx: TxCtx, date?: number): Transaction {
  return {
    ...base(ctx, date ?? Math.floor(Date.now() / 1000), orig.description, orig.category),
    tags: orig.tags ?? null,
    movements: orig.movements.map((m) => ({ sum: m.sum, fee: m.fee, account: { id: m.account.id }, invoice: null })),
  }
}
// Mark a transaction as recurring (sets `frequency` + a `recurringId` series id), or clear it.
// The exact `frequency` value follows the app's own convention (not enumerable from the
// available sources) — the CLI writes whatever value is given; verify the series in the app.
export async function setRecurring(workspaceId: string, txId: string, frequency: string | null): Promise<Transaction> {
  const t = await getTransactionById(workspaceId, txId)
  if (!t) throw new FineyeError(`Transaction not found: ${txId}`, 'not_found')
  const fields: Partial<Transaction> = { frequency }
  fields.recurringId = frequency ? (t.recurringId ?? randomUUID()) : null
  return editTransaction(txId, fields)
}
function pushId(): string {
  // FinEye movement/refund ids are ~18-char base62 (firebase push style); any unique string works.
  return (randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')).slice(0, 18)
}
// Record a partial refund on a single-leg EXPENSE: reduce its magnitude toward 0 and store the
// returned amount in movements[0].refunds (the same shape FinEye uses).
export async function refundTransaction(workspaceId: string, txId: string, amount: number): Promise<Transaction> {
  const t = await getTransactionById(workspaceId, txId)
  if (!t) throw new FineyeError(`Transaction not found: ${txId}`, 'not_found')
  if (t.movements.length !== 1) throw new FineyeError('Refund applies to a single-leg expense (not a transfer)', 'invalid')
  const m = t.movements[0]
  if (m.sum >= 0) throw new FineyeError('Refund applies to an expense (negative) transaction', 'invalid')
  if (!(amount > 0) || amount > -m.sum) throw new FineyeError(`Refund amount must be between 0 and ${-m.sum}`, 'invalid')
  const refundEntry: Movement = { id: pushId(), fee: 0, sum: amount, account: { id: m.account.id }, invoice: null, refunded: true }
  const updated: Movement = { ...m, sum: m.sum + amount, refunds: [...(m.refunds ?? []), refundEntry] }
  return editTransaction(txId, { movements: [updated] })
}
// Build a split "part": a new single-leg transaction with its own category that links back to
// the original via movements[0].split_from_transaction_id. (The original row is left unchanged —
// that matches how FinEye stores splits.)
export function buildSplitPart(
  original: Transaction,
  i: { amount: number; categoryId: string; accountId?: string; description?: string },
  ctx: TxCtx,
): Transaction {
  const ref = original.movements[0]
  const sign = ref.sum < 0 ? -1 : 1
  return {
    ...base(ctx, Number(original.time), i.description ?? `Розділено з ${original.description ?? ''}`, i.categoryId),
    movements: [
      {
        sum: sign * Math.abs(i.amount),
        fee: 0,
        account: { id: i.accountId ?? ref.account.id },
        invoice: null,
        split_from_transaction_id: original.id,
      },
    ],
  }
}
