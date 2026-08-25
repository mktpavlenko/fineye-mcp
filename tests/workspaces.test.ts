import { it, expect, vi } from 'vitest'
import * as client from '../src/client.js'
import { listWorkspaces } from '../src/domain/workspaces.js'
it('lists active memberships', async () => {
  vi.spyOn(client, 'get').mockResolvedValue([
    { workspace_id: 'w1', role: 'owner', status: 'active', workspaces: { id: 'w1', name: 'Personal', owner_id: 'u', is_personal: true } },
  ] as any)
  const ws = await listWorkspaces('u')
  expect(ws[0].workspaces.name).toBe('Personal')
})
