import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import * as client from '../src/client.js'
import { selectTransactions, withoutScheduled, countScheduled, applyAll, backup, hasTxSelection } from '../src/domain/bulk.js'
import { SCAN_LIMIT } from '../src/warn.js'

afterEach(() => vi.restoreAllMocks())
const tx = (id: string, scheduled = false) =>
  ({ id, movements: [{ sum: -1, fee: 0, account: { id: 'a' }, invoice: null, ...(scheduled ? { status: 'scheduled' } : {}) }] }) as any

describe('selectTransactions', () => {
  it('refuses to run without a selection — there is no "all rows" mode', async () => {
    await expect(selectTransactions('w', {})).rejects.toMatchObject({ code: 'gate' })
  })
  it('refuses a truncated read instead of acting on a silent subset', async () => {
    vi.spyOn(client, 'get').mockResolvedValue(Array.from({ length: SCAN_LIMIT }, (_, i) => tx(`t${i}`)) as any)
    await expect(selectTransactions('w', { search: 'x' })).rejects.toMatchObject({ code: 'gate' })
  })
  it('returns the rows for a normal selection', async () => {
    vi.spyOn(client, 'get').mockResolvedValue([tx('t1'), tx('t2')] as any)
    expect(await selectTransactions('w', { search: 'x' })).toHaveLength(2)
  })
})

describe('scheduled helpers', () => {
  const rows = [tx('a'), tx('b', true), tx('c', true)]
  it('drops scheduled installments and counts them', () => {
    expect(withoutScheduled(rows).map((t) => t.id)).toEqual(['a'])
    expect(countScheduled(rows)).toBe(2)
  })
})

describe('hasTxSelection', () => {
  it('is false only when every field is empty', () => {
    expect(hasTxSelection({})).toBe(false)
    expect(hasTxSelection({ account: 'a1' })).toBe(true)
  })
})

describe('applyAll', () => {
  it('collects failures instead of aborting the batch', async () => {
    const r = await applyAll([tx('ok1'), tx('bad'), tx('ok2')], async (t) => {
      if (t.id === 'bad') throw new Error('nope')
    })
    expect(r.done).toBe(2)
    expect(r.fails).toEqual([{ id: 'bad', err: 'nope' }])
  })
})

describe('backup', () => {
  it('writes the rows 0600 — these are financial records in a world-readable /tmp', () => {
    const path = backup('test', [{ id: 'x' }], 1)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual([{ id: 'x' }])
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})
