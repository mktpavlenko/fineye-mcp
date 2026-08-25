import { it, expect, vi, describe } from 'vitest'
import * as client from '../src/client.js'
import {
  listCategories,
  saveCategory,
  categoryAncestry,
  rootCategoryId,
  rollupSpendToRoot,
  selectCategories,
} from '../src/domain/categories.js'

describe('selectCategories (bulk selection)', () => {
  const all = [
    { id: 'housing', title: 'Житло', parent: null },
    { id: 'rent', title: 'Оренда', parent: 'housing' },
    { id: 'utils', title: 'Комунальні', parent: 'housing' },
    { id: 'food', title: 'Продукти', parent: null },
  ] as any
  it('by explicit ids', () => {
    expect(selectCategories(all, { ids: ['rent', 'food'] }).map((c) => c.id)).toEqual(['rent', 'food'])
  })
  it('by parent — all its sub-categories', () => {
    expect(selectCategories(all, { parentId: 'housing' }).map((c) => c.id)).toEqual(['rent', 'utils'])
  })
  it('by title substring (case-insensitive)', () => {
    expect(selectCategories(all, { match: 'про' }).map((c) => c.id)).toEqual(['food'])
  })
  it('returns nothing with no selector (no accidental select-all)', () => {
    expect(selectCategories(all, {})).toEqual([])
  })
})

describe('category hierarchy', () => {
  const byId = new Map(
    (
      [
        { id: 'housing', title: 'Житло', parent: null },
        { id: 'rent', title: 'Оренда', parent: 'housing' },
        { id: 'food', title: 'Продукти', parent: null },
      ] as any
    ).map((c: any) => [c.id, c]),
  )
  it('ancestry walks sub -> root', () => {
    expect(categoryAncestry('rent', byId)).toEqual(['rent', 'housing'])
    expect(categoryAncestry('housing', byId)).toEqual(['housing'])
    expect(categoryAncestry('unknown', byId)).toEqual(['unknown'])
  })
  it('rootCategoryId returns the top-level ancestor', () => {
    expect(rootCategoryId('rent', byId)).toBe('housing')
    expect(rootCategoryId('food', byId)).toBe('food')
    expect(rootCategoryId('unknown', byId)).toBe('unknown')
  })
  it('rollupSpendToRoot folds sub-category spend into the parent', () => {
    const rolled = rollupSpendToRoot({ rent: -129859, housing: -128760, food: -160204 }, byId)
    expect(rolled.housing).toBeCloseTo(-258619) // -129859 (Оренда) + -128760 (Житло)
    expect(rolled.food).toBe(-160204)
    expect(rolled.rent).toBeUndefined()
  })
})
it('lists categories for workspace', async () => {
  vi.spyOn(client, 'get').mockResolvedValue([{ id: 'c', title: 'Food', type: 'expense' }] as any)
  expect((await listCategories('w'))[0].title).toBe('Food')
})
it('saveCategory upserts via writable table with user_id', async () => {
  const spy = vi.spyOn(client, 'write').mockResolvedValue([{ id: 'c1' }] as any)
  await saveCategory({ id: 'c1', workspace_id: 'w', user_id: 'u', title: 'Food' } as any)
  expect(spy.mock.calls[0][0]).toBe('categories')
  expect((spy.mock.calls[0][1] as any).user_id).toBe('u')
})
it('saveCategory generates a uuid id when creating (no id given)', async () => {
  const spy = vi.spyOn(client, 'write').mockResolvedValue([{ id: 'x' }] as any)
  await saveCategory({ workspace_id: 'w', user_id: 'u', title: 'New' })
  const sent = spy.mock.calls[0][1] as any
  expect(sent.id).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  expect(sent.updated_at).toBeTruthy()
})
