import { z } from 'zod'
import { requireWorkspace, fxContext } from '../../commands/_shared.js'
import { resolveAccount, createAccount, editAccount, setHolding, setDebt } from '../../domain/accounts.js'
import { resolveCategory, listCategories, saveCategory, archiveCategory } from '../../domain/categories.js'
import { listTags, resolveTag, saveTag } from '../../domain/tags.js'
import {
  buildExpense,
  buildIncome,
  buildTransfer,
  saveTransaction,
  editTransaction,
  getTransactionById,
  duplicateTransaction,
  refundTransaction,
  buildSplitPart,
  setRecurring,
  serializeTx,
  assertCategorizable,
  type TxCtx,
} from '../../domain/transactions.js'
import { setBudgetPeriod, getBudgetPeriod } from '../../domain/budgets.js'
import { currentMonth } from '../../domain/analytics.js'
import { CARRY_OVER_MODES, type CarryOverMode } from '../../types.js'
import { parseDateToUnix } from '../../util.js'
import { FineyeError } from '../../errors.js'
import { run, type ToolRegistrar } from './types.js'

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
const day = (d?: string) => (d ? parseDateToUnix(d) : undefined)

export const registerWrite: ToolRegistrar = (server) => {
  server.registerTool(
    'fineye_add',
    {
      title: 'Add a transaction',
      description:
        "Create a transaction. type='expense'|'income' need `account`; type='transfer' needs `from` and `to` (both must be the user's own accounts). `amount` is always positive — the sign is derived. For a transfer between different currencies, set `toAmount` to what actually landed; leaving it out credits the same number to both legs, which is what the app does.",
      inputSchema: {
        type: z.enum(['expense', 'income', 'transfer']),
        amount: z.number().positive(),
        account: z.string().optional().describe('account name or id (expense/income)'),
        from: z.string().optional().describe('source account (transfer)'),
        to: z.string().optional().describe('destination account (transfer)'),
        toAmount: z.number().positive().optional().describe('amount credited to the destination account (transfer, different currencies)'),
        category: z.string().optional().describe('category name or id — transfers take none'),
        desc: z.string().optional(),
        date: DATE.optional().describe('defaults to today'),
        fee: z
          .number()
          .optional()
          .describe("bank fee, positive, in the account's own currency; on a transfer it is recorded on the source leg"),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const { session, workspaceId } = await requireWorkspace()
        const ctx: TxCtx = { workspaceId, userId: session.user.id }
        if (a.type === 'transfer') {
          if (!a.from || !a.to) throw new FineyeError("type='transfer' requires both `from` and `to`", 'invalid')
          const [from, to] = await Promise.all([resolveAccount(workspaceId, a.from), resolveAccount(workspaceId, a.to)])
          const t = buildTransfer(
            {
              amount: a.amount,
              toAmount: a.toAmount,
              fromId: from.id,
              toId: to.id,
              fee: a.fee ?? 0,
              description: a.desc,
              date: day(a.date),
            },
            ctx,
          )
          await saveTransaction(t)
          return {
            id: t.id,
            type: 'transfer',
            from: { name: from.name, currency: from.currency, sum: t.movements[0].sum },
            to: { name: to.name, currency: to.currency, sum: t.movements[1].sum },
            ...(from.currency !== to.currency && a.toAmount == null
              ? {
                  note: `both legs got ${a.amount} even though ${from.currency} and ${to.currency} differ — pass toAmount if that is wrong`,
                }
              : {}),
          }
        }
        if (!a.account) throw new FineyeError(`type='${a.type}' requires \`account\``, 'invalid')
        const acc = await resolveAccount(workspaceId, a.account)
        const categoryId = a.category ? (await resolveCategory(workspaceId, a.category)).id : undefined
        const build = a.type === 'expense' ? buildExpense : buildIncome
        const t = build({ amount: a.amount, accountId: acc.id, description: a.desc, categoryId, date: day(a.date), fee: a.fee }, ctx)
        await saveTransaction(t)
        return { id: t.id, type: a.type, account: acc.name, currency: acc.currency, sum: t.movements[0].sum }
      }),
  )

  server.registerTool(
    'fineye_tx',
    {
      title: 'Change a transaction',
      description:
        'Modify one existing transaction. edit: description/category/date/hold. tag|untag: add or remove one tag. refund: return part of a single-leg expense. split: carve part of it into a new row with its own category (the original is left as-is, matching the app). copy: duplicate it. recurring: set or clear a repeat frequency.',
      inputSchema: {
        action: z.enum(['edit', 'tag', 'untag', 'refund', 'split', 'copy', 'recurring']),
        id: z.string(),
        desc: z.string().optional(),
        category: z.string().optional().describe('category name or id (edit, split)'),
        clearCategory: z.boolean().optional(),
        date: DATE.optional().describe("new date (edit), or the date for the duplicate (copy; defaults to the original's)"),
        hold: z.boolean().optional().describe('mark the transaction as held / pending'),
        tag: z.string().optional().describe('tag name or id (tag, untag)'),
        amount: z.number().positive().optional().describe('refund or split amount'),
        account: z.string().optional().describe('account for the split part (defaults to the original)'),
        frequency: z
          .string()
          .nullable()
          .optional()
          .describe(
            "repeat frequency (recurring) — written to the record as-is, not validated; 'monthly' is known to work, copy other values from an existing recurring transaction. null clears the series",
          ),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const { session, workspaceId } = await requireWorkspace()
        const need = <T>(v: T | undefined | null, what: string): T => {
          if (v == null) throw new FineyeError(`action='${a.action}' requires \`${what}\``, 'invalid')
          return v
        }
        const load = async () => {
          const t = await getTransactionById(workspaceId, a.id)
          if (!t) throw new FineyeError(`Transaction not found: ${a.id}`, 'not_found')
          return t
        }
        switch (a.action) {
          case 'edit': {
            if (a.category && a.clearCategory) throw new FineyeError('Use either category or clearCategory, not both', 'invalid')
            const fields: Record<string, unknown> = {}
            if (a.desc !== undefined) fields.description = a.desc
            if (a.clearCategory) fields.category = null
            else if (a.category) {
              fields.category = (await resolveCategory(workspaceId, a.category)).id
              assertCategorizable(await load(), fields.category as string)
            }
            if (a.date) fields.time = String(day(a.date))
            if (a.hold !== undefined) fields.hold = a.hold
            if (!Object.keys(fields).length)
              throw new FineyeError('Nothing to edit (desc / category / clearCategory / date / hold)', 'invalid')
            return serializeTx(await editTransaction(a.id, fields))
          }
          case 'tag':
          case 'untag': {
            const t = await load()
            const tg = await resolveTag(workspaceId, need(a.tag, 'tag'))
            if (!tg) throw new FineyeError(`Tag not found: ${a.tag}`, 'not_found')
            const tags = new Set(t.tags ?? [])
            if (a.action === 'tag') tags.add(tg.id)
            else tags.delete(tg.id)
            return serializeTx(await editTransaction(a.id, { tags: [...tags] }))
          }
          case 'refund':
            return serializeTx(await refundTransaction(workspaceId, a.id, need(a.amount, 'amount')))
          case 'split': {
            const orig = await load()
            if (orig.movements.length !== 1) throw new FineyeError('Split applies to a single-leg transaction', 'invalid')
            const cat = await resolveCategory(workspaceId, need(a.category, 'category'))
            const accId = a.account ? (await resolveAccount(workspaceId, a.account)).id : undefined
            const part = buildSplitPart(
              orig,
              { amount: need(a.amount, 'amount'), categoryId: cat.id, accountId: accId, description: a.desc },
              { workspaceId, userId: session.user.id },
            )
            await saveTransaction(part)
            return {
              splitPart: serializeTx(part),
              original: a.id,
              note: 'the original row is unchanged — this is how the app stores splits',
            }
          }
          case 'copy': {
            const orig = await load()
            const copy = duplicateTransaction(orig, { workspaceId, userId: session.user.id }, day(a.date))
            await saveTransaction(copy)
            return serializeTx(copy)
          }
          case 'recurring':
            // Same trap as the debt ledger: a missing argument must not read as "clear it".
            if (a.frequency === undefined)
              throw new FineyeError("action='recurring' requires `frequency` (pass null to clear the series)", 'invalid')
            return serializeTx(await setRecurring(workspaceId, a.id, a.frequency))
        }
      }),
  )

  server.registerTool(
    'fineye_category',
    {
      title: 'Create or edit categories',
      description:
        "Create or edit a category, or archive it. Archive is FinEye's reversible soft-delete — prefer it over fineye_delete, which is permanent and orphans the category id on every transaction that used it.",
      inputSchema: {
        action: z.enum(['add', 'edit', 'archive', 'unarchive']),
        id: z.string().optional().describe('required for edit/archive/unarchive'),
        title: z.string().optional(),
        type: z.enum(['income', 'expense']).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        emoji: z.string().optional(),
        parent: z.string().optional().describe('parent category name or id — makes this a sub-category'),
        clearParent: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const { session, workspaceId } = await requireWorkspace()
        if (a.action === 'archive' || a.action === 'unarchive') {
          if (!a.id) throw new FineyeError(`action='${a.action}' requires \`id\``, 'invalid')
          await archiveCategory(a.id, a.action === 'archive')
          return { id: a.id, archived: a.action === 'archive' }
        }
        if (a.parent && a.clearParent) throw new FineyeError('Use either parent or clearParent, not both', 'invalid')
        const parentCat = a.parent ? await resolveCategory(workspaceId, a.parent) : undefined
        const parentId = parentCat?.id
        if (a.action === 'add') {
          if (!a.title) throw new FineyeError("action='add' requires `title`", 'invalid')
          return saveCategory({
            workspace_id: workspaceId,
            user_id: session.user.id,
            title: a.title,
            // Same rule as `cat add`: a sub-category inherits its parent's type unless told otherwise
            // — defaulting to 'expense' under an income parent would silently misfile it.
            type: a.type ?? parentCat?.type ?? 'expense',
            icon: a.icon,
            color: a.color,
            emoji: a.emoji,
            parent: parentId,
          })
        }
        if (!a.id) throw new FineyeError("action='edit' requires `id`", 'invalid')
        const existing = (await listCategories(workspaceId)).find((c) => c.id === a.id)
        if (!existing) throw new FineyeError(`Category not found: ${a.id}`, 'not_found')
        if (parentId === a.id) throw new FineyeError('A category cannot be its own parent', 'invalid')
        return saveCategory({
          ...existing,
          ...(a.title ? { title: a.title } : {}),
          ...(a.type ? { type: a.type } : {}),
          ...(a.icon ? { icon: a.icon } : {}),
          ...(a.color ? { color: a.color } : {}),
          ...(a.emoji ? { emoji: a.emoji } : {}),
          ...(a.clearParent ? { parent: null } : parentId ? { parent: parentId } : {}),
          workspace_id: workspaceId,
          user_id: session.user.id,
        })
      }),
  )

  server.registerTool(
    'fineye_tag',
    {
      title: 'Create or rename tags',
      description: 'Create a tag or rename an existing one.',
      inputSchema: { action: z.enum(['add', 'rename']), id: z.string().optional().describe('required for rename'), name: z.string() },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const { session, workspaceId } = await requireWorkspace()
        if (a.action === 'rename' && !a.id) throw new FineyeError("action='rename' requires `id`", 'invalid')
        if (a.action === 'add' && (await listTags(workspaceId)).some((t) => t.name.toLowerCase() === a.name.toLowerCase()))
          throw new FineyeError(`A tag named "${a.name}" already exists`, 'invalid')
        return saveTag({ ...(a.id ? { id: a.id } : {}), workspace_id: workspaceId, user_id: session.user.id, name: a.name })
      }),
  )

  server.registerTool(
    'fineye_account',
    {
      title: 'Create or edit accounts',
      description:
        'Create a manual account, edit its metadata and toggles, set a crypto/stock position, or set a debt-ledger entry. Never touches balance, currency, type or bank linkage — those belong to the app and its sync. Accounts can never be deleted through this server.',
      inputSchema: {
        action: z.enum(['add', 'edit', 'holding', 'debt']),
        account: z.string().optional().describe('account name or id — required except for add'),
        name: z.string().optional(),
        type: z.string().optional().describe('account type for add (cash, ccard, crypto, stocks, debt, goal…)'),
        currency: z.string().optional().describe('currency for add, or which currency of the debt ledger to set'),
        balance: z.number().optional().describe('opening balance for add'),
        emoji: z.string().optional(),
        goal: z.number().nullable().optional().describe('savings-goal target'),
        creditLimit: z.number().nullable().optional(),
        includeInTotal: z.boolean().optional(),
        includeInAnalytics: z.boolean().optional(),
        savings: z.boolean().optional(),
        archived: z.boolean().optional(),
        symbol: z.string().optional().describe('coin id (e.g. bitcoin) or ticker (e.g. VOO) for holding'),
        qty: z.number().optional(),
        avgPrice: z.number().optional(),
        stocks: z.boolean().default(false).describe('the holding is a stock rather than crypto'),
        amount: z.number().nullable().optional().describe('debt amount; null removes that currency from the ledger'),
        remove: z.boolean().default(false).describe('remove the holding instead of setting it'),
      },
      annotations: WRITE,
    },
    (a) =>
      run(async () => {
        const { session, workspaceId } = await requireWorkspace()
        if (a.action === 'add') {
          if (!a.name) throw new FineyeError("action='add' requires `name`", 'invalid')
          const created = await createAccount({
            workspace_id: workspaceId,
            user_id: session.user.id,
            name: a.name,
            type: a.type,
            currency: a.currency,
            balance: a.balance,
            emoji: a.emoji,
            goal: a.goal ?? undefined,
          })
          // createAccount hardcodes the toggles, so honour any the caller actually asked for
          // rather than returning success for an account that ignored half the request.
          const toggles = {
            ...(a.includeInTotal !== undefined ? { includeInTotal: a.includeInTotal } : {}),
            ...(a.includeInAnalytics !== undefined ? { includeInAnalytics: a.includeInAnalytics } : {}),
            ...(a.savings !== undefined ? { savings: a.savings } : {}),
            ...(a.archived !== undefined ? { archived: a.archived } : {}),
            ...(a.creditLimit !== undefined ? { creditLimit: a.creditLimit } : {}),
          }
          return Object.keys(toggles).length ? editAccount(created.id, toggles) : created
        }
        if (!a.account) throw new FineyeError(`action='${a.action}' requires \`account\``, 'invalid')
        const acc = await resolveAccount(workspaceId, a.account)
        if (a.action === 'holding') {
          if (!a.symbol) throw new FineyeError("action='holding' requires `symbol`", 'invalid')
          if (!a.remove && a.qty == null) throw new FineyeError("action='holding' requires `qty` unless remove:true", 'invalid')
          const r = await setHolding(
            acc.id,
            a.stocks ? 'stocks' : 'crypto',
            a.symbol,
            a.remove ? null : { quantity: a.qty!, avg_price: a.avgPrice ?? null },
          )
          return { id: r.id, name: r.name, crypto: r.crypto, stocks: r.stocks }
        }
        if (a.action === 'debt') {
          if (!a.currency) throw new FineyeError("action='debt' requires `currency`", 'invalid')
          // `amount ?? null` would turn a forgotten argument into "delete this ledger entry".
          // Removal has to be asked for by name, exactly as the CLI requires.
          if (!a.remove && a.amount == null)
            throw new FineyeError("action='debt' requires `amount` (or remove:true to clear the entry)", 'invalid')
          const r = await setDebt(acc.id, a.currency, a.remove ? null : a.amount!)
          return { id: r.id, name: r.name, debts: r.debts }
        }
        return editAccount(acc.id, {
          ...(a.name !== undefined ? { name: a.name } : {}),
          ...(a.emoji !== undefined ? { emoji: a.emoji } : {}),
          ...(a.goal !== undefined ? { goal: a.goal } : {}),
          ...(a.creditLimit !== undefined ? { creditLimit: a.creditLimit } : {}),
          ...(a.includeInTotal !== undefined ? { includeInTotal: a.includeInTotal } : {}),
          ...(a.includeInAnalytics !== undefined ? { includeInAnalytics: a.includeInAnalytics } : {}),
          ...(a.savings !== undefined ? { savings: a.savings } : {}),
          ...(a.archived !== undefined ? { archived: a.archived } : {}),
        })
      }),
  )

  server.registerTool(
    'fineye_budget_set',
    {
      title: 'Set the budget',
      description:
        'Set the total budget for a period (current month unless `month`). FinEye budgets are one total per period — there are no per-category budgets. Read the period first with fineye_budget: this OVERWRITES whatever is there, and a budget period cannot be deleted through this server.',
      inputSchema: {
        amount: z.number().positive(),
        currency: z.string().optional().describe('defaults to the workspace main currency'),
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        plannedIncome: z.number().optional(),
        carryOver: z.enum(CARRY_OVER_MODES).optional().describe("roll last period's leftover in"),
        carryOverMaxPercent: z.number().min(0).max(100).optional().describe('required with carryOver=percent'),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    (a) =>
      run(async () => {
        const { session, workspaceId } = await requireWorkspace()
        const period = a.month ?? currentMonth()
        if (a.carryOver === 'percent' && a.carryOverMaxPercent == null)
          throw new FineyeError('carryOver=percent requires carryOverMaxPercent', 'invalid')
        // A hardcoded 'UAH' is invisible to a model filling a schema — take the workspace's own
        // main currency unless the caller names one.
        const fx = await fxContext(workspaceId)
        const currency = a.currency ?? fx.main
        const before = await getBudgetPeriod(workspaceId, period)
        const saved = await setBudgetPeriod(workspaceId, session.user.id, period, {
          total_budget: { amount: a.amount, currency },
          ...(a.plannedIncome != null ? { planned_income: { amount: a.plannedIncome, currency } } : {}),
          ...(a.carryOver ? { carry_over_mode: a.carryOver as CarryOverMode } : {}),
          ...(a.carryOverMaxPercent != null ? { carry_over_max_percent: a.carryOverMaxPercent } : {}),
        })
        return { period, previous: before?.total_budget ?? null, budget: saved.total_budget, carryOverMode: saved.carry_over_mode }
      }),
  )
}
