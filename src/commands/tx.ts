import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { resolveCategory } from '../domain/categories.js'
import { resolveTag } from '../domain/tags.js'
import {
  editTransaction,
  serializeTx,
  getTransactionById,
  assertCategorizable,
  deleteTransaction,
  refundTransaction,
  buildSplitPart,
  saveTransaction,
  setRecurring,
  duplicateTransaction,
} from '../domain/transactions.js'
import { parseNum, parseDateToUnix } from '../util.js'
import { output } from '../render.js'
import type { Transaction } from '../types.js'
import { FineyeError } from '../errors.js'
export const txCmd = new Command('tx').description('Inspect / edit a transaction')
txCmd
  .command('show <id>')
  .option('--json')
  .action(async (id, o) => {
    const { workspaceId } = await requireWorkspace()
    const t = await getTransactionById(workspaceId, id)
    if (!t) throw new FineyeError(`Transaction not found: ${id}`, 'not_found')
    output(serializeTx(t) as any, o.json ?? true, undefined)
  })
txCmd
  .command('edit <id>')
  .option('--desc <text>')
  .option('--category <cat>')
  .option('--clear-category', 'remove the category (e.g. on a transfer the app left categorized)')
  .option('--date <iso>')
  .option('--hold', 'mark as held/pending')
  .option('--unhold', 'clear the held flag')
  .action(async (id, o) => {
    const { workspaceId } = await requireWorkspace()
    if (o.clearCategory && o.category) throw new FineyeError('Use either --category or --clear-category, not both', 'invalid')
    const fields: Partial<Transaction> = {}
    if (o.desc !== undefined) fields.description = o.desc
    if (o.clearCategory) fields.category = null
    else if (o.category) {
      const existing = await getTransactionById(workspaceId, id)
      if (!existing) throw new FineyeError(`Transaction not found: ${id}`, 'not_found')
      fields.category = (await resolveCategory(workspaceId, o.category)).id
      assertCategorizable(existing, fields.category)
    }
    if (o.date) fields.time = String(parseDateToUnix(o.date))
    if (o.hold) fields.hold = true
    if (o.unhold) fields.hold = false
    if (Object.keys(fields).length === 0)
      throw new FineyeError('Nothing to edit (use --desc / --category / --clear-category / --date / --hold / --unhold)', 'invalid')
    const updated = await editTransaction(id, fields)
    console.log(`Updated transaction ${updated.id}`)
  })
txCmd
  .command('tag <txId>')
  .description('Add or remove a tag on a transaction')
  .option('--add <tag>')
  .option('--remove <tag>')
  .action(async (txId, o) => {
    const { workspaceId } = await requireWorkspace()
    const t = await getTransactionById(workspaceId, txId)
    if (!t) throw new FineyeError(`Transaction not found: ${txId}`, 'not_found')
    const tags = new Set(t.tags ?? [])
    if (o.add) {
      const tg = await resolveTag(workspaceId, o.add)
      if (!tg) throw new FineyeError(`Tag not found: ${o.add} (create it with: fineye tag add ${o.add})`, 'not_found')
      tags.add(tg.id)
    }
    if (o.remove) {
      const tg = await resolveTag(workspaceId, o.remove)
      if (tg) tags.delete(tg.id)
    }
    await editTransaction(txId, { tags: [...tags] })
    console.log(`Updated tags for ${txId}`)
  })
txCmd
  .command('delete <id>')
  .description('PERMANENTLY delete a transaction (irreversible). Needs FINEYE_DELETE=1 + --force.')
  .option('--force', 'confirm the permanent delete')
  .action(async (id, o) => {
    const { workspaceId } = await requireWorkspace()
    const t = await getTransactionById(workspaceId, id)
    if (!t) throw new FineyeError(`Transaction not found: ${id}`, 'not_found')
    if (!o.force) throw new FineyeError(`Refusing to delete transaction ${id} without --force`, 'gate')
    await deleteTransaction(id)
    console.log(`Deleted transaction ${id}`)
  })
txCmd
  .command('refund <id>')
  .description('Record a partial refund on an expense (returns part of the amount)')
  .requiredOption('--amount <n>', 'amount returned')
  .action(async (id, o) => {
    const { workspaceId } = await requireWorkspace()
    const amount = parseNum(o.amount, 'amount')
    if (amount == null) throw new FineyeError('--amount must be a number', 'invalid')
    const t = await refundTransaction(workspaceId, id, amount)
    console.log(`Recorded refund of ${amount} on ${id} (net now ${t.movements[0].sum})`)
  })
txCmd
  .command('split <id>')
  .description('Split off part of a transaction into a new entry with its own category')
  .requiredOption('--amount <n>', 'amount to split off')
  .requiredOption('--category <name|id>', 'category for the split part')
  .option('--account <id>', "account for the part (defaults to the original's)")
  .option('--desc <text>', 'description for the part')
  .action(async (id, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const orig = await getTransactionById(workspaceId, id)
    if (!orig) throw new FineyeError(`Transaction not found: ${id}`, 'not_found')
    if (orig.movements.length !== 1) throw new FineyeError('Split applies to a single-leg transaction', 'invalid')
    const amount = parseNum(o.amount, 'amount')
    if (amount == null || amount <= 0) throw new FineyeError('--amount must be a positive number', 'invalid')
    const cat = await resolveCategory(workspaceId, o.category)
    const part = buildSplitPart(
      orig,
      { amount, categoryId: cat.id, accountId: o.account, description: o.desc },
      { workspaceId, userId: session.user.id },
    )
    const saved = await saveTransaction(part)
    console.log(`Created split part ${amount} -> ${cat.title} (id ${saved.id}, linked to ${id})`)
  })
txCmd
  .command('copy <id>')
  .description("Duplicate a transaction into a new entry (today's date unless --date)")
  .option('--date <iso>')
  .action(async (id, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const orig = await getTransactionById(workspaceId, id)
    if (!orig) throw new FineyeError(`Transaction not found: ${id}`, 'not_found')
    const copy = duplicateTransaction(orig, { workspaceId, userId: session.user.id }, o.date ? parseDateToUnix(o.date) : undefined)
    const saved = await saveTransaction(copy)
    console.log(`Copied ${id} -> new transaction ${saved.id}`)
  })
txCmd
  .command('recurring <id>')
  .description('Mark a transaction as recurring (--frequency) or clear it (--clear)')
  .option('--frequency <value>', 'recurrence value per the app convention, e.g. monthly|weekly|daily|yearly')
  .option('--clear', 'remove the recurrence')
  .action(async (id, o) => {
    const { workspaceId } = await requireWorkspace()
    if (!!o.frequency === !!o.clear) throw new FineyeError('Specify exactly one of --frequency <value> or --clear', 'invalid')
    const t = await setRecurring(workspaceId, id, o.clear ? null : o.frequency)
    console.log(o.clear ? `Cleared recurrence on ${id}` : `Set ${id} recurring: ${t.frequency} (series ${t.recurringId})`)
  })
