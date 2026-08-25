import { z } from 'zod'
import { requireWorkspace } from '../../commands/_shared.js'
import { resolveAccount } from '../../domain/accounts.js'
import { deleteTransaction, getTransactionById, editTransaction, txType, isScheduled } from '../../domain/transactions.js'
import { listCategories, deleteCategory, archiveCategory, countCategoryUsage, resolveCategory } from '../../domain/categories.js'
import { listTags, deleteTag, resolveTag } from '../../domain/tags.js'
import { selectTransactions, withoutScheduled, countScheduled, pickCategories, backup, applyAll } from '../../domain/bulk.js'
import { isDeleteEnabled } from '../../constants.js'
import { FineyeError } from '../../errors.js'
import { run, collectWarnings, CONFIRM_HINT, type ToolRegistrar } from './types.js'
import { fmtUnixDate } from '../../util.js'
import type { Transaction } from '../../types.js'

const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
const line = (t: Transaction) =>
  `${fmtUnixDate(t.time)}  ${(t.description ?? '').slice(0, 40)}${isScheduled(t) ? '  (scheduled)' : ''}  ${t.id}`

export const registerDestructive: ToolRegistrar = (server) => {
  server.registerTool(
    'fineye_delete',
    {
      title: 'Delete permanently',
      description: `PERMANENTLY delete one transaction, category or tag. Irreversible — there is no undo and no trash. ${CONFIRM_HINT} The server must also have been started with FINEYE_DELETE=1. For categories, prefer fineye_category action='archive': it is reversible, whereas deleting orphans the category id on every transaction that used it. Accounts can never be deleted.`,
      inputSchema: {
        kind: z.enum(['transaction', 'category', 'tag']),
        id: z.string(),
        confirm: z.boolean().default(false).describe('false returns a preview and deletes nothing'),
      },
      annotations: DESTRUCTIVE,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        // Preview BEFORE the env gate, so the model can show the user what would go and then ask
        // them to enable FINEYE_DELETE if they actually want it.
        if (a.kind === 'transaction') {
          const t = await getTransactionById(workspaceId, a.id)
          if (!t) throw new FineyeError(`Transaction not found: ${a.id}`, 'not_found')
          if (!a.confirm)
            return {
              dryRun: true,
              wouldDelete: {
                kind: 'transaction',
                id: t.id,
                date: fmtUnixDate(t.time),
                description: t.description,
                type: txType(t),
                scheduled: isScheduled(t),
              },
              hint: 'call again with confirm:true — this cannot be undone',
            }
          await deleteTransaction(a.id)
          return { deleted: { kind: 'transaction', id: a.id } }
        }
        if (a.kind === 'category') {
          const cat = (await listCategories(workspaceId)).find((c) => c.id === a.id)
          if (!cat) throw new FineyeError(`Category not found: ${a.id}`, 'not_found')
          const w = collectWarnings()
          const used = await countCategoryUsage(workspaceId, a.id, w.warn)
          if (!a.confirm)
            return w.attach({
              dryRun: true,
              wouldDelete: { kind: 'category', id: cat.id, title: cat.title },
              usedByTransactions: used,
              hint: used
                ? `${used} transactions would keep an orphaned category id — archiving is reversible and usually what you want`
                : 'call again with confirm:true — this cannot be undone',
            })
          await deleteCategory(a.id)
          return w.attach({ deleted: { kind: 'category', id: a.id, title: cat.title }, orphanedTransactions: used })
        }
        const tag = (await listTags(workspaceId)).find((t) => t.id === a.id)
        if (!tag) throw new FineyeError(`Tag not found: ${a.id}`, 'not_found')
        if (!a.confirm)
          return {
            dryRun: true,
            wouldDelete: { kind: 'tag', id: tag.id, name: tag.name },
            hint: 'call again with confirm:true — this cannot be undone',
          }
        await deleteTag(a.id)
        return { deleted: { kind: 'tag', id: a.id, name: tag.name } }
      }),
  )

  server.registerTool(
    'fineye_bulk',
    {
      title: 'Bulk changes',
      description: `Act on many rows at once. DRY RUN unless apply:true — without it you get the matched set and nothing changes. A filter (transactions) or selection (categories) is REQUIRED; there is no "everything" mode. Destructive actions additionally need confirm:true and FINEYE_DELETE=1, and write a JSON backup to /tmp first. Scheduled installments are excluded from delete-transactions unless includeScheduled:true.`,
      inputSchema: {
        action: z.enum(['recategorize', 'tag', 'untag', 'delete-transactions', 'archive-categories', 'delete-categories']),
        from: DATE.optional(),
        to: DATE.optional(),
        account: z.string().optional().describe('account name or id — filters transactions'),
        category: z.string().optional().describe('category name or id — filters transactions'),
        search: z.string().optional().describe('substring of the description (case-insensitive)'),
        ids: z.array(z.string()).optional().describe('explicit category ids (category actions)'),
        parent: z.string().optional().describe('parent category name or id — selects all its sub-categories (category actions)'),
        match: z.string().optional().describe('categories whose title contains this (category actions)'),
        setCategory: z.string().optional().describe('category name or id to assign (recategorize)'),
        clearCategory: z.boolean().optional(),
        tag: z.string().optional().describe('tag name or id (tag, untag)'),
        includeScheduled: z.boolean().default(false),
        apply: z.boolean().default(false),
        confirm: z.boolean().default(false).describe('required in addition to apply for the destructive actions'),
      },
      annotations: DESTRUCTIVE,
    },
    (a) =>
      run(async () => {
        const { workspaceId } = await requireWorkspace()
        const w = collectWarnings()
        const isCategoryAction = a.action === 'archive-categories' || a.action === 'delete-categories'
        const destructive = a.action === 'delete-transactions' || a.action === 'delete-categories'

        if (isCategoryAction) {
          const cats = await pickCategories(workspaceId, { ids: a.ids, parent: a.parent, match: a.match })
          const usage =
            a.action === 'delete-categories' ? await Promise.all(cats.map((c) => countCategoryUsage(workspaceId, c.id, w.warn))) : []
          const preview = cats.map((c, i) => ({ id: c.id, title: c.title, ...(usage.length ? { usedByTransactions: usage[i] } : {}) }))
          if (!a.apply || (destructive && !a.confirm))
            return w.attach({
              dryRun: true,
              action: a.action,
              matched: cats.length,
              items: preview.slice(0, 25),
              hint: destructive ? 'set apply:true AND confirm:true to execute — irreversible' : 'set apply:true to execute',
            })
          if (destructive && !isDeleteEnabled())
            throw new FineyeError('Delete is disabled — the server must be started with FINEYE_DELETE=1', 'gate')
          const path = destructive ? backup('cat-delete', cats) : null
          const r = await applyAll(cats, (c) => (destructive ? deleteCategory(c.id) : archiveCategory(c.id, true)))
          return w.attach({ action: a.action, done: r.done, failed: r.fails, ...(path ? { backup: path } : {}) })
        }

        // The underlying filters match raw ids only — resolve names first, or "black" silently
        // matches 0 rows and a dry run reports an empty set instead of erroring.
        const [account, category] = await Promise.all([
          a.account ? resolveAccount(workspaceId, a.account).then((x) => x.id) : undefined,
          a.category ? resolveCategory(workspaceId, a.category).then((x) => x.id) : undefined,
        ])
        const all = await selectTransactions(workspaceId, { from: a.from, to: a.to, account, category, search: a.search }, w.warn)
        let items = a.action === 'delete-transactions' && !a.includeScheduled ? withoutScheduled(all) : all
        let skippedTransfers = 0
        let cat: { id: string; title: string } | null = null
        let tagRef: { id: string; name: string } | null = null

        if (a.action === 'recategorize') {
          if (!!a.setCategory === !!a.clearCategory) throw new FineyeError('Specify exactly one of setCategory or clearCategory', 'invalid')
          cat = a.clearCategory ? null : await resolveCategory(workspaceId, a.setCategory!)
          if (cat) {
            const n = items.length
            items = items.filter((t) => txType(t) !== 'transfer') // a transfer never carries a spending category
            skippedTransfers = n - items.length
          }
        }
        if (a.action === 'tag' || a.action === 'untag') {
          if (!a.tag) throw new FineyeError(`action='${a.action}' requires \`tag\``, 'invalid')
          const found = await resolveTag(workspaceId, a.tag)
          if (!found) throw new FineyeError(`Tag not found: ${a.tag}`, 'not_found')
          tagRef = found
          items = items.filter((t) => (t.tags ?? []).includes(found.id) === (a.action === 'untag'))
        }

        const info = {
          action: a.action,
          matched: items.length,
          items: items.slice(0, 25).map(line),
          ...(skippedTransfers ? { skippedTransfers } : {}),
          ...(a.action === 'delete-transactions'
            ? { skippedScheduled: all.length - items.length }
            : { scheduledIncluded: countScheduled(items) }),
        }
        if (!a.apply || (destructive && !a.confirm))
          return w.attach({
            dryRun: true,
            ...info,
            hint: destructive ? 'set apply:true AND confirm:true to execute — irreversible' : 'set apply:true to execute',
          })
        if (destructive && !isDeleteEnabled())
          throw new FineyeError('Delete is disabled — the server must be started with FINEYE_DELETE=1', 'gate')

        if (a.action === 'delete-transactions') {
          const path = backup('tx-delete', items)
          const r = await applyAll(items, (t) => deleteTransaction(t.id))
          return w.attach({ ...info, done: r.done, failed: r.fails, backup: path })
        }
        const r = await applyAll(items, (t) => {
          if (a.action === 'recategorize') return editTransaction(t.id, { category: cat?.id ?? null })
          const tags = new Set(t.tags ?? [])
          if (a.action === 'tag') tags.add(tagRef!.id)
          else tags.delete(tagRef!.id)
          return editTransaction(t.id, { tags: [...tags] })
        })
        return w.attach({ ...info, done: r.done, failed: r.fails })
      }),
  )
}
