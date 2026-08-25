import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { editTransaction, deleteTransaction, txType, isScheduled } from '../domain/transactions.js'
import { selectTransactions, withoutScheduled, countScheduled, pickCategories, backup, applyAll } from '../domain/bulk.js'
import { resolveCategory, archiveCategory, deleteCategory, countCategoryUsage } from '../domain/categories.js'
import { resolveTag } from '../domain/tags.js'
import { isDeleteEnabled } from '../constants.js'
import { fmtUnixDate } from '../util.js'
import { warnStderr } from '../warn.js'
import { FineyeError } from '../errors.js'

// ---- shared bulk plumbing (dry-run by default) ----
function preview(title: string, lines: string[]): void {
  console.log(`${title}: ${lines.length} item(s)`)
  lines.slice(0, 10).forEach((l) => console.log('  ' + l))
  if (lines.length > 10) console.log(`  … and ${lines.length - 10} more`)
}
// returns true when we should STOP (dry-run); false when --apply was given
function dryStop(apply: boolean, count: number): boolean {
  if (count === 0) {
    console.log('Nothing matches — nothing to do.')
    return true
  }
  if (!apply) {
    console.log('\nDry-run — nothing changed. Re-run with --apply to execute.')
    return true
  }
  return false
}
// A count alone reads like "mostly fine" — show what actually broke.
function report(verb: string, done: number, fails: { id: string; err: string }[]): void {
  console.log(`${verb} ${done}${fails.length ? `, ${fails.length} failed` : ''}.`)
  fails.slice(0, 5).forEach((f) => console.error(`  ✗ ${f.id}: ${f.err}`))
  if (fails.length > 5) console.error(`  … and ${fails.length - 5} more failures`)
}
const addTxFilters = (cmd: Command) =>
  cmd.option('--from <date>').option('--to <date>').option('--account <id>').option('--category <id>').option('--search <q>')
// Scheduled legs are installment payments the bank has NOT executed yet (dated years out).
// Re-categorizing or tagging them is legitimate; silently deleting them is not — so the two
// paths differ: this only tells the user they're in the set.

export const bulkCmd = new Command('bulk').description('Bulk actions — dry-run by default; pass --apply to execute')

// 1) bulk re-categorize transactions
addTxFilters(bulkCmd.command('recategorize'))
  .description('Set/clear the category of transactions matching a filter')
  .option('--set-category <name|id>')
  .option('--clear-category')
  .option('--apply')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    if (!!o.setCategory === !!o.clearCategory)
      throw new FineyeError('Specify exactly one of --set-category <cat> or --clear-category', 'invalid')
    const cat = o.clearCategory ? null : await resolveCategory(workspaceId, o.setCategory)
    let txns = await selectTransactions(workspaceId, o, warnStderr)
    let skipped = 0
    if (cat) {
      const n = txns.length
      txns = txns.filter((t) => txType(t) !== 'transfer') // never put a spending category on a transfer
      skipped = n - txns.length
    }
    preview(
      `Would set category -> ${cat?.title ?? '(none)'}`,
      txns.map((t) => `${fmtUnixDate(t.time)}  ${(t.description ?? '').slice(0, 40)}${isScheduled(t) ? '  (scheduled)' : ''}`),
    )
    if (skipped) console.log(`  (${skipped} transfers skipped — transfers carry no spending category)`)
    const nSched = countScheduled(txns)
    if (nSched) console.log(`  (${nSched} of these are scheduled installments — future payments, not yet executed)`)
    if (dryStop(o.apply, txns.length)) return
    const { done, fails } = await applyAll(txns, (t) => editTransaction(t.id, { category: cat?.id ?? null }))
    report('Updated', done, fails)
  })

// 2) bulk delete transactions
addTxFilters(bulkCmd.command('delete-transactions'))
  .description('PERMANENTLY delete transactions matching a filter (needs FINEYE_DELETE=1)')
  .option('--include-scheduled', 'also delete scheduled installment payments (excluded by default)')
  .option('--apply')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const all = await selectTransactions(workspaceId, o, warnStderr)
    // A date filter like `--account X` sweeps in the bank's future installment schedule. Deleting
    // those is irreversible and almost never what "delete these transactions" meant, so they are
    // out unless asked for by name.
    const txns = o.includeScheduled ? all : withoutScheduled(all)
    const heldBack = all.length - txns.length
    preview(
      'Would PERMANENTLY DELETE transactions',
      txns.map((t) => `${fmtUnixDate(t.time)}  ${(t.description ?? '').slice(0, 40)}${isScheduled(t) ? '  (scheduled)' : ''}  ${t.id}`),
    )
    if (heldBack) console.log(`  (${heldBack} scheduled installment payments skipped — pass --include-scheduled to delete them too)`)
    if (dryStop(o.apply, txns.length)) return
    if (!isDeleteEnabled())
      throw new FineyeError('Delete is disabled. Set FINEYE_DELETE=1 to enable it (a separate opt-in from writes).', 'gate')
    const path = backup('tx-delete', txns)
    console.log(`Backup of ${txns.length} rows -> ${path}`)
    const { done, fails } = await applyAll(txns, (t) => deleteTransaction(t.id))
    report('Deleted', done, fails)
  })

// 3) bulk tag / untag transactions (the app got multi-select tagging in the 2026-08 update)
addTxFilters(bulkCmd.command('tag'))
  .description('Add or remove a tag on all transactions matching a filter')
  .option('--add <tag>', 'tag name or id to add')
  .option('--remove <tag>', 'tag name or id to remove')
  .option('--apply')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    if (!!o.add === !!o.remove) throw new FineyeError('Specify exactly one of --add <tag> or --remove <tag>', 'invalid')
    const name = o.add ?? o.remove
    const tag = await resolveTag(workspaceId, name)
    if (!tag) throw new FineyeError(`Tag not found: ${name}${o.add ? ` (create it with: fineye tag add ${name})` : ''}`, 'not_found')
    const all = await selectTransactions(workspaceId, o, warnStderr)
    // Skip rows that already have (or already lack) the tag — nothing to write, and it keeps
    // the preview honest about how many transactions actually change.
    const txns = all.filter((t) => (t.tags ?? []).includes(tag.id) === !!o.remove)
    preview(
      `Would ${o.add ? 'ADD' : 'REMOVE'} tag "${tag.name}"`,
      txns.map((t) => `${fmtUnixDate(t.time)}  ${(t.description ?? '').slice(0, 40)}${isScheduled(t) ? '  (scheduled)' : ''}`),
    )
    if (all.length !== txns.length) console.log(`  (${all.length - txns.length} already ${o.add ? 'tagged' : 'untagged'} — skipped)`)
    const nSched = countScheduled(txns)
    if (nSched) console.log(`  (${nSched} of these are scheduled installments — future payments, not yet executed)`)
    if (dryStop(o.apply, txns.length)) return
    const { done, fails } = await applyAll(txns, (t) => {
      const tags = new Set(t.tags ?? [])
      if (o.add) tags.add(tag.id)
      else tags.delete(tag.id)
      return editTransaction(t.id, { tags: [...tags] })
    })
    report('Updated', done, fails)
  })

// category selection helpers
const addCatSel = (cmd: Command) =>
  cmd
    .option('--ids <id,...>', 'comma-separated category ids')
    .option('--parent <name|id>', 'all sub-categories of this parent')
    .option('--match <substr>', 'categories whose title contains this')

// 3) bulk archive categories (reversible)
addCatSel(bulkCmd.command('archive-categories'))
  .description('Archive categories matching a selection (reversible)')
  .option('--apply')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const cats = await pickCategories(workspaceId, {
      ids: o.ids?.split(',').map((x: string) => x.trim()),
      parent: o.parent,
      match: o.match,
    })
    preview(
      'Would archive categories',
      cats.map((c) => c.title),
    )
    if (dryStop(o.apply, cats.length)) return
    const { done, fails } = await applyAll(cats, (c) => archiveCategory(c.id, true))
    report('Archived', done, fails)
  })

// 4) bulk delete categories
addCatSel(bulkCmd.command('delete-categories'))
  .description('PERMANENTLY delete categories matching a selection (needs FINEYE_DELETE=1)')
  .option('--apply')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const cats = await pickCategories(workspaceId, {
      ids: o.ids?.split(',').map((x: string) => x.trim()),
      parent: o.parent,
      match: o.match,
    })
    const usage = await Promise.all(cats.map((c) => countCategoryUsage(workspaceId, c.id)))
    preview(
      'Would PERMANENTLY DELETE categories',
      cats.map((c, i) => `${c.title}${usage[i] ? ` (used by ${usage[i]} tx -> orphaned)` : ''}`),
    )
    if (dryStop(o.apply, cats.length)) return
    if (!isDeleteEnabled())
      throw new FineyeError('Delete is disabled. Set FINEYE_DELETE=1 to enable it (a separate opt-in from writes).', 'gate')
    const path = backup('cat-delete', cats)
    console.log(`Backup -> ${path}`)
    const { done, fails } = await applyAll(cats, (c) => deleteCategory(c.id))
    report('Deleted', done, fails)
  })
