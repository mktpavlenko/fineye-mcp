import { describe, it, expect, vi, afterEach } from 'vitest'
import * as session from '../src/auth/session.js'
import { get, write, del } from '../src/client.js'
import { FineyeError, EXIT_CODE } from '../src/errors.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
const asFineye = async (p: Promise<unknown>): Promise<FineyeError> => {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(FineyeError)
    return e as FineyeError
  }
  throw new Error('expected a rejection')
}
const mockFetch = (status: number, body = '') => {
  vi.spyOn(session, 'getValidAccessToken').mockResolvedValue('tok')
  vi.spyOn(session, 'forceRefresh').mockResolvedValue('tok2')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, text: async () => body }))
}

describe('FineyeError codes', () => {
  it('maps 403 to forbidden and carries the status', async () => {
    mockFetch(403, 'row-level security')
    const e = await asFineye(get('transactions'))
    expect(e.code).toBe('forbidden')
    expect(e.status).toBe(403)
  })
  it('maps 404 to not_found', async () => {
    mockFetch(404)
    expect((await asFineye(get('nope'))).code).toBe('not_found')
  })
  it('maps other HTTP failures to api', async () => {
    mockFetch(429, 'slow down')
    const e = await asFineye(get('transactions'))
    expect(e.code).toBe('api')
    expect(e.status).toBe(429)
  })
  it('maps a failed fetch to network, not api', async () => {
    vi.spyOn(session, 'getValidAccessToken').mockResolvedValue('tok')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const e = await asFineye(get('transactions'))
    expect(e.code).toBe('network')
    expect(e.status).toBeUndefined()
  })
  it('tags our own safety gates as gate, not api', async () => {
    vi.stubEnv('FINEYE_READONLY', '1')
    expect((await asFineye(write('transactions', {}))).code).toBe('gate')
    vi.stubEnv('FINEYE_READONLY', '')
    expect((await asFineye(write('net_worth', {}))).code).toBe('gate') // not in the allow-list
    expect((await asFineye(del('transactions', { id: 'eq.x' }))).code).toBe('gate') // FINEYE_DELETE unset
  })
})

describe('exit codes', () => {
  it('gives each code its own exit status; only the two refusals share one', () => {
    expect(new Set(Object.values(EXIT_CODE)).size).toBe(6) // forbidden and gate deliberately share 4
    expect(EXIT_CODE.auth).not.toBe(EXIT_CODE.network)
    expect(EXIT_CODE.not_found).not.toBe(EXIT_CODE.invalid)
  })
})
