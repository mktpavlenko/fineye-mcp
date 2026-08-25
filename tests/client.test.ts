import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as session from '../src/auth/session.js'
import { get, getOne, write, patch, rpc } from '../src/client.js'
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(session, 'getValidAccessToken').mockResolvedValue('TOK')
  vi.spyOn(session, 'forceRefresh').mockResolvedValue('TOK2')
})
describe('client', () => {
  it('get attaches apikey+bearer and parses array', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }))
    const rows = await get('accounts', { workspace_id: 'eq.ws', select: '*' })
    expect(rows).toEqual([{ id: 1 }])
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toContain('/rest/v1/accounts?workspace_id=eq.ws&select=*')
    expect((init as any).headers['Authorization']).toBe('Bearer TOK')
    expect((init as any).headers['apikey']).toBeTruthy()
  })
  it('getOne returns first row or null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{ id: 9 }]), { status: 200 }))
    expect(await getOne('accounts', { id: 'eq.9' })).toEqual({ id: 9 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }))
    expect(await getOne('accounts', { id: 'eq.0' })).toBeNull()
  })
  it('retries once on 401 with a refreshed token', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
    f.mockResolvedValueOnce(new Response('unauth', { status: 401 }))
    f.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }))
    const rows = await get('accounts')
    expect(rows).toEqual([{ id: 1 }])
    expect((f.mock.calls[1][1] as any).headers['Authorization']).toBe('Bearer TOK2')
  })
  it('write rejects non-allowlisted table (workspaces not writable)', async () => {
    await expect(write('workspaces', { id: 1 })).rejects.toThrow(/not writable/i)
  })
  it('write allows transactions upsert', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ id: 't1' }]), { status: 201 }))
    expect(await write('transactions', { id: 't1' })).toEqual([{ id: 't1' }])
  })
  it('patch allows accounts but throws on empty filter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ id: 'a1' }]), { status: 200 }))
    expect(await patch('accounts', { id: 'eq.a1' }, { name: 'X' })).toEqual([{ id: 'a1' }])
    await expect(patch('transactions', {}, { description: 'y' })).rejects.toThrow(/non-empty filter/i)
  })
  it('rpc rejects non-readonly fn', async () => {
    await expect(rpc('delete_user_data', {})).rejects.toThrow(/not allowed/i)
  })
})
