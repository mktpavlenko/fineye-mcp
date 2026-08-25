import { randomUUID } from 'node:crypto'
import { get, write, del } from '../client.js'
import type { Tag } from '../types.js'
export async function listTags(workspaceId: string): Promise<Tag[]> {
  return get<Tag>('tags', { select: '*', workspace_id: `eq.${workspaceId}`, order: 'name.asc' })
}
export async function resolveTag(workspaceId: string, nameOrId: string): Promise<Tag | null> {
  const all = await listTags(workspaceId)
  return all.find((t) => t.id === nameOrId) ?? all.find((t) => t.name.toLowerCase() === nameOrId.toLowerCase()) ?? null
}
// RLS requires user_id = auth.uid(). Tags use the `name` column.
export async function saveTag(t: { id?: string; workspace_id: string; user_id: string; name: string }): Promise<Tag> {
  const row = { ...t, id: t.id ?? randomUUID(), updated_at: new Date().toISOString() }
  const [saved] = await write<Tag>('tags', row)
  return saved
}
// Hard delete (irreversible) — gated by the client (FINEYE_DELETE + allow-list).
export async function deleteTag(id: string): Promise<void> {
  await del('tags', { id: `eq.${id}` })
}
