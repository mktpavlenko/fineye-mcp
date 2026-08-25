import { it, expect, vi } from 'vitest'
import * as client from '../src/client.js'
import { listAccounts, editAccount } from '../src/domain/accounts.js'
it('lists non-archived workspace accounts', async () => {
  vi.spyOn(client, 'get').mockResolvedValue([
    { id: 'a', name: 'Cash', balance: 10, currency: 'UAH', type: 'ccard', archived: false },
    { id: 'b', name: 'Old', balance: 0, currency: 'UAH', type: 'ccard', archived: true },
  ] as any)
  const r = await listAccounts('w')
  expect(r).toHaveLength(1)
  expect(r[0].name).toBe('Cash')
})
it('editAccount patches ONLY name/emoji/archived and drops forbidden fields', async () => {
  const spy = vi.spyOn(client, 'patch').mockResolvedValue([{ id: 'a' }] as any)
  await editAccount('a', { name: 'New', emoji: '💳', archived: true, balance: 999, currency: 'USD', type: 'goal' } as any)
  const [table, q, body] = spy.mock.calls[0]
  expect(table).toBe('accounts')
  expect(q).toEqual({ id: 'eq.a' })
  expect((body as any).name).toBe('New')
  expect((body as any).emoji).toBe('💳')
  expect((body as any).archived).toBe(true)
  expect((body as any).balance).toBeUndefined()
  expect((body as any).currency).toBeUndefined()
  expect((body as any).type).toBeUndefined()
})
it('editAccount throws if no editable field given', async () => {
  await expect(editAccount('a', { balance: 5 } as any)).rejects.toThrow(/no editable/i)
})
