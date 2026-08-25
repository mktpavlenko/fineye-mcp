import { randomUUID } from 'node:crypto'
import { get, write, patch, del } from '../client.js'
import type { Category } from '../types.js'
import { SCAN_LIMIT, type Warn } from '../warn.js'
import { FineyeError } from '../errors.js'
export async function listCategories(workspaceId: string): Promise<Category[]> {
  return get<Category>('categories', { select: '*', workspace_id: `eq.${workspaceId}`, order: 'title.asc' })
}
// Pure selector for bulk ops: by explicit ids, by parent (all its sub-categories), or by title substring.
export function selectCategories(all: Category[], sel: { ids?: string[]; parentId?: string; match?: string }): Category[] {
  if (sel.ids?.length) {
    const set = new Set(sel.ids)
    return all.filter((c) => set.has(c.id))
  }
  if (sel.parentId) return all.filter((c) => c.parent === sel.parentId)
  if (sel.match) {
    const m = sel.match.toLowerCase()
    return all.filter((c) => c.title.toLowerCase().includes(m))
  }
  return []
}
// Reversible archive (FinEye's own soft-delete): set/clear archived_at.
export async function archiveCategory(id: string, archived: boolean): Promise<void> {
  await patch('categories', { id: `eq.${id}` }, { archived_at: archived ? new Date().toISOString() : null })
}
// Hard delete (irreversible) — gated by the client (FINEYE_DELETE + allow-list).
export async function deleteCategory(id: string): Promise<void> {
  await del('categories', { id: `eq.${id}` })
}
// How many transactions reference this category (to warn before a hard delete).
export async function countCategoryUsage(workspaceId: string, categoryId: string, warn: Warn = () => {}): Promise<number> {
  const rows = await get<{ id: string }>('transactions', {
    select: 'id',
    workspace_id: `eq.${workspaceId}`,
    category: `eq.${categoryId}`,
    limit: String(SCAN_LIMIT),
  })
  // This count is shown right before an irreversible delete — an undercount would understate it.
  if (rows.length >= SCAN_LIMIT) warn(`category usage count hit the ${SCAN_LIMIT}-row cap — the real number is higher`)
  return rows.length
}
export async function resolveCategory(workspaceId: string, titleOrId: string): Promise<Category> {
  const all = await listCategories(workspaceId)
  const hit = all.find((c) => c.id === titleOrId) ?? all.find((c) => c.title.toLowerCase() === titleOrId.toLowerCase())
  if (!hit) throw new FineyeError(`Category not found: ${titleOrId}`, 'not_found')
  return hit
}
export async function saveCategory(c: Partial<Category> & { workspace_id: string; user_id: string; title: string }): Promise<Category> {
  const row = { ...c, id: c.id ?? randomUUID(), updated_at: new Date().toISOString() } // RLS requires user_id; spread first so generated fields win
  const [saved] = await write<Category>('categories', row)
  return saved
}

// ---- Hierarchy (parent / sub-category) ----
// FinEye categories form a shallow tree: a sub-category points at its root via `parent`.
// Ids from `catId` up to and including its top-level root (cycle/depth guarded).
export function categoryAncestry(catId: string, byId: Map<string, Category>): string[] {
  const chain: string[] = []
  const seen = new Set<string>()
  let cur = byId.get(catId)
  while (cur && !seen.has(cur.id)) {
    chain.push(cur.id)
    seen.add(cur.id)
    cur = cur.parent ? byId.get(cur.parent) : undefined
  }
  return chain.length ? chain : [catId] // unknown id -> itself
}
// Top-level (root) ancestor id; the id itself if it is already a root or unknown.
export function rootCategoryId(catId: string, byId: Map<string, Category>): string {
  const chain = categoryAncestry(catId, byId)
  return chain[chain.length - 1]
}
// Collapse a leaf-keyed spend map into root-category totals (the app's top-level view).
export function rollupSpendToRoot(sums: Record<string, number>, byId: Map<string, Category>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [leafId, v] of Object.entries(sums)) {
    const key = rootCategoryId(leafId, byId)
    out[key] = (out[key] ?? 0) + v
  }
  return out
}
