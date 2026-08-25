import { describe, it, expect, vi, afterEach } from 'vitest'
import * as client from '../src/client.js'
import { del } from '../src/client.js'
import { deleteCategory, archiveCategory } from '../src/domain/categories.js'
import { deleteTransaction } from '../src/domain/transactions.js'
import { deleteTag } from '../src/domain/tags.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('del() safety gates', () => {
  it('refuses when FINEYE_DELETE is not set (separate opt-in from writes)', async () => {
    vi.stubEnv('FINEYE_DELETE', '')
    await expect(del('transactions', { id: 'eq.t1' })).rejects.toThrow(/disabled/i)
  })
  it('refuses in read-only mode even if delete is enabled', async () => {
    vi.stubEnv('FINEYE_DELETE', '1')
    vi.stubEnv('FINEYE_READONLY', '1')
    await expect(del('transactions', { id: 'eq.t1' })).rejects.toThrow(/read-only/i)
  })
  it('refuses a non-deletable table (e.g. accounts)', async () => {
    vi.stubEnv('FINEYE_DELETE', '1')
    vi.stubEnv('FINEYE_READONLY', '')
    await expect(del('accounts', { id: 'eq.a1' })).rejects.toThrow(/not deletable/i)
  })
  it('refuses without a single id filter (mass-delete guard)', async () => {
    vi.stubEnv('FINEYE_DELETE', '1')
    vi.stubEnv('FINEYE_READONLY', '')
    await expect(del('transactions', { category: 'eq.c1' })).rejects.toThrow(/single id/i)
    await expect(del('transactions', { id: 'in.(a,b)' })).rejects.toThrow(/single id/i)
  })
})

describe('domain delete / archive wiring', () => {
  it('deleteCategory calls del on categories by id', async () => {
    const spy = vi.spyOn(client, 'del').mockResolvedValue(undefined)
    await deleteCategory('c1')
    expect(spy).toHaveBeenCalledWith('categories', { id: 'eq.c1' })
  })
  it('deleteTransaction calls del on transactions by id', async () => {
    const spy = vi.spyOn(client, 'del').mockResolvedValue(undefined)
    await deleteTransaction('t1')
    expect(spy).toHaveBeenCalledWith('transactions', { id: 'eq.t1' })
  })
  it('deleteTag calls del on tags by id', async () => {
    const spy = vi.spyOn(client, 'del').mockResolvedValue(undefined)
    await deleteTag('tag1')
    expect(spy).toHaveBeenCalledWith('tags', { id: 'eq.tag1' })
  })
  it('archiveCategory sets archived_at and clears it on unarchive', async () => {
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([] as any)
    await archiveCategory('c1', true)
    expect(spy.mock.calls[0][0]).toBe('categories')
    expect(spy.mock.calls[0][1]).toEqual({ id: 'eq.c1' })
    expect((spy.mock.calls[0][2] as any).archived_at).toBeTruthy()
    await archiveCategory('c1', false)
    expect((spy.mock.calls[1][2] as any).archived_at).toBeNull()
  })
})
