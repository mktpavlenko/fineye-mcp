import { get, patch } from '../client.js'
import { FineyeError } from '../errors.js'

// FinEye auto-categorization rules live as a JSON array in workspace_settings.scenarios_overrides
// (NOT a table; the learned `scenarios` column is a separate, model-built thing we don't touch).
//
// SCHEMA: the app rewrote every rule into this condition-based shape on 2026-07-26 (all 70 rows
// share one updatedAt — a single migration). The previous flat shape (mcc/merchantFingerprint/
// originalDescription) no longer exists in the data and is NOT read here.
export interface RuleCondition {
  field: 'description' | 'mcc'
  value: string
  operator: 'equals'
}
// The index signature is load-bearing: rules round-trip through us untouched, so a field the app
// adds later survives our writes. See `mutate`-style edits below — never rebuild a rule object.
export interface RuleOverride {
  id: string
  type: 'category'
  categoryId: string
  createdAt: number
  updatedAt: number
  conditions: RuleCondition[]
  [k: string]: unknown
}

// The value the app matches on, e.g. condValue(r,'description') -> 'Крамниця', condValue(r,'mcc') -> '5411'.
export function condValue(r: RuleOverride, field: RuleCondition['field']): string | null {
  return r.conditions?.find((c) => c.field === field)?.value ?? null
}

export async function getOverrides(workspaceId: string): Promise<RuleOverride[]> {
  const [ws] = await get<{ scenarios_overrides: RuleOverride[] | null }>('workspace_settings', {
    select: 'scenarios_overrides',
    workspace_id: `eq.${workspaceId}`,
  })
  return ws?.scenarios_overrides ?? []
}
// Persist the whole array back (single field; client.patch field-guards workspace_settings).
// The array is written VERBATIM — rules we didn't touch keep every key the app put on them.
async function saveOverrides(workspaceId: string, overrides: RuleOverride[]): Promise<void> {
  await patch('workspace_settings', { workspace_id: `eq.${workspaceId}` }, { scenarios_overrides: overrides })
}

function newId(now: number): string {
  return `override_${now}_${Math.random().toString(36).slice(2, 11)}`
}
// Same (description, mcc) pair = same rule. `mcc` is stored as a STRING in the conditions.
function sameMatch(r: RuleOverride, description: string, mcc: number): boolean {
  return condValue(r, 'description') === description && condValue(r, 'mcc') === String(mcc)
}

// Add (or, if the same description+mcc already exists, re-point) a merchant->category rule.
export async function addRule(
  workspaceId: string,
  i: { description: string; mcc: number; categoryId: string; now: number },
): Promise<{ rule: RuleOverride; updatedExisting: boolean }> {
  const overrides = await getOverrides(workspaceId)
  const existing = overrides.find((o) => sameMatch(o, i.description, i.mcc))
  if (existing) {
    existing.categoryId = i.categoryId // mutate in place: unknown keys stay on the object
    existing.updatedAt = i.now
    await saveOverrides(workspaceId, overrides)
    return { rule: existing, updatedExisting: true }
  }
  const rule: RuleOverride = {
    id: newId(i.now),
    type: 'category',
    categoryId: i.categoryId,
    createdAt: i.now,
    updatedAt: i.now,
    conditions: [
      { field: 'description', value: i.description, operator: 'equals' },
      { field: 'mcc', value: String(i.mcc), operator: 'equals' },
    ],
  }
  await saveOverrides(workspaceId, [...overrides, rule])
  return { rule, updatedExisting: false }
}

// Re-point an existing rule (by id) to a different category.
export async function editRule(workspaceId: string, id: string, i: { categoryId: string; now: number }): Promise<RuleOverride> {
  const overrides = await getOverrides(workspaceId)
  const rule = overrides.find((o) => o.id === id)
  if (!rule) throw new FineyeError(`Rule not found: ${id}`, 'not_found')
  rule.categoryId = i.categoryId // mutate in place, see addRule
  rule.updatedAt = i.now
  await saveOverrides(workspaceId, overrides)
  return rule
}
