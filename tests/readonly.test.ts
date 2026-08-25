import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as session from '../src/auth/session.js'
import { write, patch } from '../src/client.js'
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(session, 'getValidAccessToken').mockResolvedValue('T')
})
afterEach(() => {
  delete process.env.FINEYE_READONLY
})
it('write/patch refuse when FINEYE_READONLY=1', async () => {
  process.env.FINEYE_READONLY = '1'
  await expect(write('transactions', { id: 't' })).rejects.toThrow(/read-only/i)
  await expect(patch('transactions', { id: 'eq.t' }, { description: 'x' })).rejects.toThrow(/read-only/i)
})
it('write refuses for truthy values like "true"/"yes"', async () => {
  process.env.FINEYE_READONLY = 'true'
  await expect(write('transactions', { id: 't' })).rejects.toThrow(/read-only/i)
  process.env.FINEYE_READONLY = 'YES'
  await expect(write('transactions', { id: 't' })).rejects.toThrow(/read-only/i)
})
