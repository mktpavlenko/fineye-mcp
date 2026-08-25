import { describe, it, expect, vi, afterEach } from 'vitest'
import * as client from '../src/client.js'
import { patch } from '../src/client.js'
import { addRule, editRule, condValue, getOverrides, type RuleOverride } from '../src/domain/rules.js'

afterEach(() => vi.restoreAllMocks()) // so the field-guard test below hits the REAL patch(), not a leaked mock

// Fixtures copied from the user's real scenarios_overrides (the shape the app migrated to on
// 2026-07-26). Note `mcc` is a STRING inside the conditions.
const fora = (): RuleOverride => ({
  id: 'override_1768831745987_htz0vda02',
  type: 'category',
  createdAt: 1768831745987,
  updatedAt: 1785052009372,
  categoryId: 'cat-produkty',
  conditions: [
    { field: 'description', value: 'Крамниця', operator: 'equals' },
    { field: 'mcc', value: '5411', operator: 'equals' },
  ],
})
const mockOverrides = (rows: RuleOverride[]) => vi.spyOn(client, 'get').mockResolvedValue([{ scenarios_overrides: rows }] as any)
const saved = (spy: ReturnType<typeof vi.spyOn>) => (spy.mock.calls[0][2] as any).scenarios_overrides as RuleOverride[]

describe('condValue', () => {
  it('reads the matched values out of the conditions array', () => {
    expect(condValue(fora(), 'description')).toBe('Крамниця')
    expect(condValue(fora(), 'mcc')).toBe('5411')
  })
  it('returns null when the condition is absent', () => {
    expect(condValue({ ...fora(), conditions: [] }, 'description')).toBeNull()
  })
})

describe('getOverrides', () => {
  it('returns [] when the workspace has no rules', async () => {
    vi.spyOn(client, 'get').mockResolvedValue([] as any)
    expect(await getOverrides('w')).toEqual([])
  })
})

describe('addRule', () => {
  it('writes the condition-based shape the app reads', async () => {
    mockOverrides([])
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{}] as any)
    const { rule, updatedExisting } = await addRule('w', { description: 'Крамниця', mcc: 5411, categoryId: 'cat1', now: 1000 })
    expect(updatedExisting).toBe(false)
    expect(rule.type).toBe('category')
    expect(rule.categoryId).toBe('cat1')
    expect(rule.id).toMatch(/^override_1000_[a-z0-9]{1,9}$/)
    expect(rule.conditions).toEqual([
      { field: 'description', value: 'Крамниця', operator: 'equals' },
      { field: 'mcc', value: '5411', operator: 'equals' }, // string, not number
    ])
    const [table, , body] = spy.mock.calls[0]
    expect(table).toBe('workspace_settings')
    expect((body as any).scenarios_overrides).toHaveLength(1)
  })

  it('re-points an existing rule with the same description+mcc instead of duplicating', async () => {
    mockOverrides([fora()])
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{}] as any)
    const { rule, updatedExisting } = await addRule('w', { description: 'Крамниця', mcc: 5411, categoryId: 'new', now: 2000 })
    expect(updatedExisting).toBe(true)
    expect(rule.categoryId).toBe('new')
    expect(rule.updatedAt).toBe(2000)
    expect(saved(spy)).toHaveLength(1) // no duplicate
  })

  it('treats a different mcc as a different rule', async () => {
    mockOverrides([fora()])
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{}] as any)
    const { updatedExisting } = await addRule('w', { description: 'Крамниця', mcc: 5999, categoryId: 'c', now: 2000 })
    expect(updatedExisting).toBe(false)
    expect(saved(spy)).toHaveLength(2)
  })

  // The one way this rewrite could destroy data: rebuilding rule objects from the fields we know
  // about would drop anything the app adds later. Every edit must mutate the raw object.
  it('preserves keys it does not know about when re-pointing a rule', async () => {
    mockOverrides([{ ...fora(), someFutureField: { nested: true } } as RuleOverride])
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{}] as any)
    await addRule('w', { description: 'Крамниця', mcc: 5411, categoryId: 'new', now: 2000 })
    expect(saved(spy)[0].someFutureField).toEqual({ nested: true })
  })

  it('preserves untouched sibling rules verbatim', async () => {
    const other = { ...fora(), id: 'other', appOnlyFlag: 7 } as RuleOverride
    mockOverrides([other])
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{}] as any)
    await addRule('w', { description: 'Setapp', mcc: 5817, categoryId: 'c', now: 2000 })
    expect(saved(spy)[0]).toEqual(other)
  })
})

describe('editRule', () => {
  it('re-points by id and keeps unknown keys', async () => {
    mockOverrides([{ ...fora(), appOnlyFlag: 7 } as RuleOverride])
    const spy = vi.spyOn(client, 'patch').mockResolvedValue([{}] as any)
    const rule = await editRule('w', 'override_1768831745987_htz0vda02', { categoryId: 'new', now: 3000 })
    expect(rule.categoryId).toBe('new')
    expect(saved(spy)[0].appOnlyFlag).toBe(7)
  })
  it('throws on an unknown id', async () => {
    mockOverrides([fora()])
    await expect(editRule('w', 'nope', { categoryId: 'c', now: 1 })).rejects.toThrow(/Rule not found/)
  })
})

describe('workspace_settings field guard', () => {
  it('rejects PATCHing any field other than scenarios_overrides', async () => {
    await expect(patch('workspace_settings', { workspace_id: 'eq.w' }, { main_currency: 'USD' })).rejects.toThrow(
      /only \[scenarios_overrides\]/,
    )
  })
})
