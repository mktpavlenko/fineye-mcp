import { describe, it, expect, vi } from 'vitest'
import * as client from '../src/client.js'
import { SCAN_LIMIT } from '../src/warn.js'
import {
  listTransactions,
  buildExpense,
  buildIncome,
  buildTransfer,
  saveTransaction,
  editTransaction,
  txType,
  isScheduled,
  assertCategorizable,
  serializeTx,
  getTransactionById,
  buildSplitPart,
  setRecurring,
  duplicateTransaction,
} from '../src/domain/transactions.js'

describe('duplicateTransaction', () => {
  it('makes a fresh independent copy: new id, details kept, split/refund links dropped', () => {
    const orig = {
      id: 'o',
      description: 'Coffee',
      category: 'c',
      tags: ['t'],
      movements: [{ sum: -10, fee: 1, account: { id: 'a' }, invoice: { sum: -10 }, split_from_transaction_id: 's', refunds: [{}] }],
    } as any
    const copy = duplicateTransaction(orig, { workspaceId: 'w', userId: 'u' }, 1700000000)
    expect(copy.id).not.toBe('o')
    expect(copy.id).toMatch(/[0-9a-f-]{36}/)
    expect(copy.description).toBe('Coffee')
    expect(copy.category).toBe('c')
    expect(copy.tags).toEqual(['t'])
    expect(copy.time).toBe('1700000000')
    expect(copy.movements[0].sum).toBe(-10)
    expect(copy.movements[0].split_from_transaction_id).toBeUndefined()
    expect(copy.movements[0].refunds).toBeUndefined()
  })
})

describe('buildSplitPart', () => {
  const orig = {
    id: 'orig1',
    time: '1700000000',
    description: 'Термінал',
    movements: [{ sum: -22000, fee: 0, account: { id: 'a1' }, invoice: null }],
  } as any
  it('creates a same-sign part linked to the original via split_from_transaction_id', () => {
    const part = buildSplitPart(orig, { amount: 3000, categoryId: 'cat-x' }, { workspaceId: 'w', userId: 'u' })
    expect(part.category).toBe('cat-x')
    expect(part.description).toContain('Розділено з')
    expect(part.movements).toHaveLength(1)
    expect(part.movements[0].sum).toBe(-3000) // matches the original leg's sign
    expect(part.movements[0].account.id).toBe('a1') // inherits the original account
    expect(part.movements[0].split_from_transaction_id).toBe('orig1')
  })
  it('honors an explicit account override', () => {
    const part = buildSplitPart(orig, { amount: 100, categoryId: 'c', accountId: 'a2' }, { workspaceId: 'w', userId: 'u' })
    expect(part.movements[0].account.id).toBe('a2')
  })
})

describe('getTransactionById (direct lookup, no recent-window)', () => {
  it('queries by id + workspace and returns the row', async () => {
    const spy = vi.spyOn(client, 'getOne').mockResolvedValue({ id: 'old-id', movements: [] } as any)
    const r = await getTransactionById('w', 'old-id')
    const q = spy.mock.calls[0][1] as any
    expect(q.id).toBe('eq.old-id')
    expect(q.workspace_id).toBe('eq.w')
    expect(r?.id).toBe('old-id')
  })
  it('returns null only when the id truly does not exist', async () => {
    vi.spyOn(client, 'getOne').mockResolvedValue(null as any)
    expect(await getTransactionById('w', 'nope')).toBeNull()
  })
})

describe('txType', () => {
  it('single negative leg = expense', () => {
    expect(txType({ movements: [{ sum: -10 }] } as any)).toBe('expense')
  })
  it('single positive leg = income', () => {
    expect(txType({ movements: [{ sum: 250 }] } as any)).toBe('income')
  })
  it('two opposite legs = transfer (regardless of stored category)', () => {
    expect(txType({ movements: [{ sum: -50 }, { sum: 50 }] } as any)).toBe('transfer')
  })
})

describe('serializeTx (machine-facing shape)', () => {
  it('adds a derived type, preserves source fields, but DROPS person (noise)', () => {
    const raw = {
      id: 't1',
      category: 'cat-transport',
      tags: ['x'],
      person: { id: 'p1' },
      merchant: { mcc: 5411 },
      movements: [
        { sum: -50, account: { id: 'a' } },
        { sum: 50, account: { id: 'b' } },
      ],
    } as any
    const s = serializeTx(raw)
    expect(s.type).toBe('transfer')
    expect(s.category).toBe('cat-transport') // raw category preserved for re-categorization
    expect(s.tags).toEqual(['x'])
    expect(s.movements).toHaveLength(2)
    expect('person' in s).toBe(false) // person is cut from the agent shape
    expect((s as any).merchant).toEqual({ mcc: 5411 }) // merchant kept
  })
})

describe('transactions read', () => {
  it('builds time/category filters server-side', async () => {
    const spy = vi.spyOn(client, 'get').mockResolvedValue([] as any)
    await listTransactions('w', { from: '2026-01-01', to: '2026-02-01', category: 'c1', limit: 50 })
    const q = spy.mock.calls[0][1] as any
    expect(q.workspace_id).toBe('eq.w')
    expect(q.category).toBe('eq.c1')
    expect(q.order).toContain('time.desc')
    expect(q.limit).toBe('50')
    expect(q.and).toContain('time.gte.')
    // `to` is inclusive of the whole day: strict-less-than the start of the next day
    expect(q.and).toContain(`time.lt.${Math.floor(Date.parse('2026-02-02') / 1000)}`)
  })
  it('account filter: filters in memory then applies limit/offset on the filtered rows', async () => {
    vi.spyOn(client, 'get').mockResolvedValue([
      { id: '1', movements: [{ account: { id: 'a1' } }] },
      { id: '2', movements: [{ account: { id: 'a2' } }] },
      { id: '3', movements: [{ account: { id: 'a1' } }] },
      { id: '4', movements: [{ account: { id: 'a1' } }] },
    ] as any)
    const r = await listTransactions('w', { account: 'a1', limit: 2 })
    expect(r.map((t) => t.id)).toEqual(['1', '3']) // a1 rows only, first 2
    const r2 = await listTransactions('w', { account: 'a1', limit: 2, offset: 2 })
    expect(r2.map((t) => t.id)).toEqual(['4'])
  })
  it('applies offset/limit for pagination', async () => {
    const spy = vi.spyOn(client, 'get').mockResolvedValue([] as any)
    await listTransactions('w', { limit: 20, offset: 40 })
    const q = spy.mock.calls[0][1] as any
    expect(q.limit).toBe('20')
    expect(q.offset).toBe('40')
  })
})

describe('transaction builders', () => {
  const ctx = { workspaceId: 'w', userId: 'u', now: 1781000000 }
  it('expense = single negative movement', () => {
    const t = buildExpense({ amount: 107.8, accountId: 'a1', description: 'Coffee', categoryId: 'c1' }, ctx)
    expect(t.movements).toEqual([{ sum: -107.8, fee: 0, account: { id: 'a1' }, invoice: null }])
    expect(t.category).toBe('c1')
    expect(t.description).toBe('Coffee')
    expect(t.workspace_id).toBe('w')
    expect(t.user_id).toBe('u')
    expect(t.id).toMatch(/[0-9a-f-]{36}/)
    expect(t.updated_at).toMatch(/\d{4}-\d\d-\d\dT/)
  })
  it('income = single positive movement', () => {
    expect(buildIncome({ amount: 500, accountId: 'a1' }, ctx).movements[0].sum).toBe(500)
  })
  it('transfer = opposite-sign pair', () => {
    const t = buildTransfer({ amount: 145, fromId: 'a1', toId: 'a2' }, ctx)
    expect(t.movements).toEqual([
      { sum: -145, fee: 0, account: { id: 'a1' }, invoice: null },
      { sum: 145, fee: 0, account: { id: 'a2' }, invoice: null },
    ])
  })
  // Deliberately pinned: the app writes equal magnitudes for a manual cross-currency transfer,
  // so the default must NOT start converting behind the user's back.
  it('transfer defaults the destination leg to the same magnitude', () => {
    const t = buildTransfer({ amount: 100, fromId: 'a1', toId: 'a2' }, ctx)
    expect(t.movements.map((m) => m.sum)).toEqual([-100, 100])
  })
  it('transfer credits --to-amount to the destination leg when given', () => {
    const t = buildTransfer({ amount: 100, toAmount: 2.4, fromId: 'a1', toId: 'a2' }, ctx)
    expect(t.movements.map((m) => m.sum)).toEqual([-100, 2.4])
  })
  it('rejects a non-positive --to-amount', () => {
    expect(() => buildTransfer({ amount: 100, toAmount: 0, fromId: 'a1', toId: 'a2' }, ctx)).toThrow(/positive/i)
  })
  it('rejects non-positive amount', () => {
    expect(() => buildExpense({ amount: 0, accountId: 'a1' }, ctx)).toThrow(/positive/i)
  })
})

describe('transaction persist', () => {
  it('saveTransaction upserts via writable client.write', async () => {
    const spy = vi.spyOn(client, 'write').mockResolvedValue([{ id: 't1' }] as any)
    const t = { id: 't1', movements: [] } as any
    await saveTransaction(t)
    expect(spy).toHaveBeenCalledWith('transactions', t)
  })
  it('editTransaction patches with id filter + bumps updated_at', async () => {
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{ id: 't1' }] as any)
    await editTransaction('t1', { description: 'new' })
    const [table, q, body] = spy.mock.calls[0]
    expect(table).toBe('transactions')
    expect(q).toEqual({ id: 'eq.t1' })
    expect((body as any).description).toBe('new')
    expect((body as any).updated_at).toBeTruthy()
  })
  it('editTransaction throws a clean error when no row matched (empty PATCH result)', async () => {
    vi.spyOn(client, 'patch').mockResolvedValue([] as any)
    await expect(editTransaction('bad-id', { description: 'x' })).rejects.toThrow(/not found/i)
  })
  it('editTransaction can clear a category (sends category: null) — backs --clear-category', async () => {
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{ id: 't1' }] as any)
    await editTransaction('t1', { category: null })
    const [, , body] = spy.mock.calls[0]
    expect((body as any).category).toBeNull()
    expect('category' in (body as any)).toBe(true)
  })
  it('setRecurring sets frequency + a recurringId series, and clears both', async () => {
    vi.spyOn(client, 'getOne').mockResolvedValue({ id: 't1', recurringId: null, movements: [] } as any)
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{ id: 't1' }] as any)
    await setRecurring('w', 't1', 'monthly')
    let body = spy.mock.calls[0][2] as any
    expect(body.frequency).toBe('monthly')
    expect(body.recurringId).toMatch(/[0-9a-f-]{36}/) // generated series id
    await setRecurring('w', 't1', null)
    body = spy.mock.calls[1][2] as any
    expect(body.frequency).toBeNull()
    expect(body.recurringId).toBeNull()
  })
})

// The predicate `bulk delete-transactions` relies on to keep the bank's future installment
// schedule out of an irreversible delete.
describe('isScheduled', () => {
  const tx = (movements: any[]) => ({ movements }) as any
  it('is true when any leg is a not-yet-executed installment', () => {
    expect(isScheduled(tx([{ sum: -1649.9, account: { id: 'a' }, status: 'scheduled', scheduled_date: '2028-01-31' }]))).toBe(true)
  })
  it('is false for an ordinary executed transaction', () => {
    expect(isScheduled(tx([{ sum: -30, account: { id: 'a' } }]))).toBe(false)
  })
  it('filters a mixed set down to the executed rows', () => {
    const rows = [tx([{ sum: -1, account: { id: 'a' } }]), tx([{ sum: -2, account: { id: 'a' }, status: 'scheduled' }])]
    expect(rows.filter((t) => !isScheduled(t))).toHaveLength(1)
  })
})

// The whole point of step 5: a scan that silently returns fewer rows than exist turns a total
// into a wrong number, not a shorter list.
describe('truncation warnings', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, movements: [] }))
  it('warns when a scan-everything read comes back exactly at the cap', async () => {
    vi.spyOn(client, 'get').mockResolvedValue(rows(SCAN_LIMIT) as any)
    const seen: string[] = []
    await listTransactions('w', { limit: SCAN_LIMIT }, (m) => seen.push(m))
    expect(seen[0]).toMatch(/hit the 100000-row cap/)
  })
  it('stays quiet when a paginated read fills its own page', async () => {
    vi.spyOn(client, 'get').mockResolvedValue(rows(100) as any)
    const seen: string[] = []
    await listTransactions('w', { limit: 100 }, (m) => seen.push(m))
    expect(seen).toEqual([])
  })
  it('widens the --account scan to the requested limit instead of capping at 5000', async () => {
    const spy = vi.spyOn(client, 'get').mockResolvedValue([] as any)
    await listTransactions('w', { account: 'a1', limit: SCAN_LIMIT })
    expect((spy.mock.calls[0][1] as any).limit).toBe(String(SCAN_LIMIT))
  })
  it('still scans 5000 for an ordinary --account listing', async () => {
    const spy = vi.spyOn(client, 'get').mockResolvedValue([] as any)
    await listTransactions('w', { account: 'a1' })
    expect((spy.mock.calls[0][1] as any).limit).toBe('5000')
  })
})

// The invariant 455 rows were backfilled to restore: a transfer moves money between the user's own
// accounts, so a SPENDING category on one is meaningless and poisons category-based aggregates.
describe('assertCategorizable', () => {
  const transfer = { movements: [{ sum: -50 }, { sum: 50 }] } as any
  const expense = { movements: [{ sum: -50 }] } as any
  it('refuses a spending category on a transfer', () => {
    expect(() => assertCategorizable(transfer, 'cat-food')).toThrow(/transfer/i)
  })
  it('still allows CLEARING a category on a transfer', () => {
    expect(() => assertCategorizable(transfer, null)).not.toThrow()
    expect(() => assertCategorizable(transfer, undefined)).not.toThrow()
  })
  it('leaves ordinary expenses alone', () => {
    expect(() => assertCategorizable(expense, 'cat-food')).not.toThrow()
  })
})
