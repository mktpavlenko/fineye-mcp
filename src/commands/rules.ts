import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { getOverrides, addRule, editRule, condValue } from '../domain/rules.js'
import { resolveCategory, listCategories } from '../domain/categories.js'
import { listTransactions } from '../domain/transactions.js'
import { output } from '../render.js'
import { parseNum } from '../util.js'
import { FineyeError } from '../errors.js'

export const rulesCmd = new Command('rules')
  .description('List auto-categorization rules (merchant -> category)')
  .option('--json')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const [overrides, cats] = await Promise.all([getOverrides(workspaceId), listCategories(workspaceId)])
    const title = new Map(cats.map((c) => [c.id, c.title]))
    if (o.json) {
      console.log(JSON.stringify(overrides, null, 2))
      return
    }
    output(
      overrides.map((r) => ({
        merchant: condValue(r, 'description') ?? '—',
        mcc: condValue(r, 'mcc') ?? '—',
        // a rule pointing at a deleted category never fires — surface it instead of echoing a dead id
        category: title.get(r.categoryId) ?? `⚠ deleted category (${r.categoryId.slice(0, 8)}…)`,
        id: r.id,
      })),
      false,
      ['merchant', 'mcc', 'category', 'id'],
    )
  })

export const ruleCmd = new Command('rule').description('Create / edit auto-categorization rules')
ruleCmd
  .command('add')
  .description('Add a rule: when a transaction matches <merchant>+<mcc>, categorize it as <category>')
  .requiredOption('--merchant <text>', 'transaction description to match EXACTLY (as it appears on the transaction)')
  .requiredOption('--category <name|id>', 'category to assign')
  .requiredOption('--mcc <code>', "MCC code (see a transaction's merchant.mcc)")
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const cat = await resolveCategory(workspaceId, o.category)
    const mcc = parseNum(o.mcc, 'mcc')
    if (mcc == null) throw new FineyeError('--mcc must be a number', 'invalid')
    // The app matches `description equals <value>` on the raw string, so a lookalike character
    // (typographic ’ vs ') silently never fires. Warn if nothing in the history matches exactly.
    const near = await listTransactions(workspaceId, { search: o.merchant, limit: 200 })
    if (!near.some((t) => t.description === o.merchant))
      console.error(
        `⚠ no transaction has the description exactly "${o.merchant}" — the rule may never fire (check the apostrophe/spacing against a real transaction)`,
      )
    const { rule, updatedExisting } = await addRule(workspaceId, {
      description: o.merchant,
      mcc,
      categoryId: cat.id,
      now: Date.now(),
    })
    console.log(
      `${updatedExisting ? 'Updated existing' : 'Added'} rule: "${condValue(rule, 'description')}" (mcc ${condValue(rule, 'mcc')}) -> ${cat.title}`,
    )
  })
ruleCmd
  .command('edit <id>')
  .description('Re-point an existing rule to a different category')
  .requiredOption('--category <name|id>', 'new category to assign')
  .action(async (id, o) => {
    const { workspaceId } = await requireWorkspace()
    const cat = await resolveCategory(workspaceId, o.category)
    const rule = await editRule(workspaceId, id, { categoryId: cat.id, now: Date.now() })
    console.log(`Updated rule "${condValue(rule, 'description')}" -> ${cat.title}`)
  })
