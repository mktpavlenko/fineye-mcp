import { it, expect, vi } from 'vitest'
import * as client from '../src/client.js'
import { saveTag } from '../src/domain/tags.js'
import { createAccount } from '../src/domain/accounts.js'
it('saveTag posts to tags with user_id + generated id', async () => {
  const spy = vi.spyOn(client, 'write').mockResolvedValue([{ id: 't1' }] as any)
  await saveTag({ workspace_id: 'w', user_id: 'u', name: 'Travel' })
  expect(spy.mock.calls[0][0]).toBe('tags')
  const body = spy.mock.calls[0][1] as any
  expect(body.user_id).toBe('u')
  expect(body.name).toBe('Travel')
  expect(body.id).toMatch(/[0-9a-f-]{36}/)
})
it('createAccount posts a new account with defaults + user_id', async () => {
  const spy = vi.spyOn(client, 'write').mockResolvedValue([{ id: 'a1' }] as any)
  await createAccount({ workspace_id: 'w', user_id: 'u', name: 'Готівка', type: 'cash', currency: 'UAH', balance: 100 })
  const body = spy.mock.calls[0][1] as any
  expect(spy.mock.calls[0][0]).toBe('accounts')
  expect(body.name).toBe('Готівка')
  expect(body.user_id).toBe('u')
  expect(body.includeInTotal).toBe(true)
  expect(body.id).toMatch(/[0-9a-f-]{36}/)
})
