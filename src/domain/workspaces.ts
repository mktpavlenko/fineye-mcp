import { get } from '../client.js'
import type { Membership } from '../types.js'
import { getActiveWorkspace, setActiveWorkspace } from '../config.js'
import { FineyeError } from '../errors.js'
export async function listWorkspaces(userId: string): Promise<Membership[]> {
  return get<Membership>('workspace_members', {
    select: 'workspace_id,role,status,workspaces!inner(id,name,owner_id,is_personal)',
    user_id: `eq.${userId}`,
    status: 'eq.active',
  })
}
export async function resolveWorkspaceId(userId: string): Promise<string> {
  const active = getActiveWorkspace()
  if (active) return active
  const ws = await listWorkspaces(userId)
  if (!ws.length) throw new FineyeError('No workspaces found for this account.', 'not_found')
  const personal = ws.find((w) => w.workspaces.is_personal) ?? ws[0]
  setActiveWorkspace(personal.workspace_id)
  return personal.workspace_id
}
