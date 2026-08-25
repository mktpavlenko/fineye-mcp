import { z } from 'zod'
import { requireWorkspace } from '../../commands/_shared.js'
import { getOverrides, addRule, editRule, condValue } from '../../domain/rules.js'
import { listCategories, resolveCategory } from '../../domain/categories.js'
import { listTransactions } from '../../domain/transactions.js'
import { FineyeError } from '../../errors.js'
import { run, collectWarnings, type ToolRegistrar } from './types.js'
import { isReadonly } from '../../constants.js'

export const registerRules: ToolRegistrar = (server) => {
  // Listing rules is a plain read, so it belongs on a read-only server too — but add/edit must not
  // even appear there. Narrowing the enum keeps the tool honest instead of offering an action that
  // can only ever be refused.
  const readonly = isReadonly()
  const ACTIONS = readonly ? (['list'] as const) : (['list', 'add', 'edit'] as const)
  server.registerTool(
    'fineye_rules',
    {
      title: 'Auto-categorization rules',
      description:
        "Auto-categorization rules: description + MCC -> category. They apply to FUTURE incoming transactions only — adding one never re-categorizes existing rows (use fineye_bulk action='recategorize' for that). The description is matched with `equals` on the raw string, so it must be copied exactly from a real transaction. `edit` changes only the assigned category — to change the matched description or MCC, add a new rule (rules can only be removed in the app).",
      inputSchema: {
        action: z.enum(ACTIONS).default('list'),
        id: z.string().optional().describe('rule id (edit)'),
        merchant: z.string().optional().describe('the transaction description to match, exactly (add)'),
        mcc: z.number().int().optional().describe("MCC code — see a transaction's merchant.mcc (add)"),
        category: z.string().optional().describe('category name or id to assign'),
      },
      annotations: { readOnlyHint: readonly, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        const cats = await listCategories(workspaceId)
        const title = new Map(cats.map((c) => [c.id, c.title]))
        const view = (r: Parameters<typeof condValue>[0]) => ({
          id: r.id,
          merchant: condValue(r, 'description'),
          mcc: condValue(r, 'mcc'),
          category: title.get(r.categoryId) ?? null,
          categoryId: r.categoryId,
          // a rule pointing at a deleted category can never fire again
          ...(title.has(r.categoryId) ? {} : { orphaned: true }),
        })
        if (a.action === 'list') return (await getOverrides(workspaceId)).map(view)

        // Resolve nothing until the action's own arguments are known-good, or a missing `category`
        // surfaces as "Category not found: " and sends the model chasing the rule id instead.
        if (!a.category) throw new FineyeError(`action='${a.action}' requires \`category\``, 'invalid')
        if (a.action === 'edit' && !a.id) throw new FineyeError("action='edit' requires `id`", 'invalid')
        // Silently ignoring these would report success on a rule that still matches the old strings.
        if (a.action === 'edit' && (a.merchant != null || a.mcc != null))
          throw new FineyeError('edit can only change `category` — to change merchant or mcc, add a new rule', 'invalid')
        if (a.action === 'add' && (!a.merchant || a.mcc == null))
          throw new FineyeError("action='add' requires `merchant` and `mcc`", 'invalid')
        const cat = await resolveCategory(workspaceId, a.category)
        if (a.action === 'edit') return view(await editRule(workspaceId, a.id!, { categoryId: cat.id, now: Date.now() }))
        const merchant = a.merchant!
        const mcc = a.mcc!
        const w = collectWarnings()
        // An exact-match rule on a description that appears nowhere will never fire — usually a
        // lookalike apostrophe. Say so rather than letting it sit there silently doing nothing.
        const near = await listTransactions(workspaceId, { search: merchant, limit: 200 })
        if (!near.some((t) => t.description === merchant))
          w.warn(
            `no transaction has the description exactly "${merchant}" — this rule may never fire (check the apostrophe and spacing against a real transaction)`,
          )
        const { rule, updatedExisting } = await addRule(workspaceId, {
          description: merchant,
          mcc,
          categoryId: cat.id,
          now: Date.now(),
        })
        return w.attach({ ...view(rule), updatedExisting, note: 'applies to future incoming transactions only' })
      }),
  )
}
