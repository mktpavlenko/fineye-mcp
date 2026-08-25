import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { resolveAccount } from '../domain/accounts.js'
import { resolveCategory } from '../domain/categories.js'
import { buildExpense, buildIncome, buildTransfer, saveTransaction, type TxCtx } from '../domain/transactions.js'
import { parseDateToUnix, parseNum } from '../util.js'
function dateToUnix(d?: string): number | undefined {
  return d ? parseDateToUnix(d) : undefined
}
// The positional <amount> deserves the same validation as --fee: `add expense abc` used to reach
// the domain as NaN and fail with a vague "amount must be positive".
function amt(v: string): number {
  return parseNum(v, 'amount') as number
}
export const addCmd = new Command('add').description('Add a transaction (expense / income / transfer)')
addCmd
  .command('expense <amount>')
  .requiredOption('--account <acc>')
  .option('--category <cat>')
  .option('--desc <text>')
  .option('--date <iso>')
  .option('--fee <n>')
  .action(async (amount, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const ctx: TxCtx = { workspaceId, userId: session.user.id }
    const acc = await resolveAccount(workspaceId, o.account)
    const categoryId = o.category ? (await resolveCategory(workspaceId, o.category)).id : undefined
    const t = buildExpense(
      { amount: amt(amount), accountId: acc.id, description: o.desc, categoryId, date: dateToUnix(o.date), fee: parseNum(o.fee, 'fee') },
      ctx,
    )
    await saveTransaction(t)
    console.log(`Added expense ${amount} ${acc.currency} on ${acc.name} (id ${t.id})`)
  })
addCmd
  .command('income <amount>')
  .requiredOption('--account <acc>')
  .option('--category <cat>')
  .option('--desc <text>')
  .option('--date <iso>')
  .option('--fee <n>')
  .action(async (amount, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const ctx: TxCtx = { workspaceId, userId: session.user.id }
    const acc = await resolveAccount(workspaceId, o.account)
    const categoryId = o.category ? (await resolveCategory(workspaceId, o.category)).id : undefined
    const t = buildIncome(
      { amount: amt(amount), accountId: acc.id, description: o.desc, categoryId, date: dateToUnix(o.date), fee: parseNum(o.fee, 'fee') },
      ctx,
    )
    await saveTransaction(t)
    console.log(`Added income ${amount} ${acc.currency} on ${acc.name} (id ${t.id})`)
  })
addCmd
  .command('transfer <amount>')
  .requiredOption('--from <acc>')
  .requiredOption('--to <acc>')
  .option('--to-amount <n>', 'amount credited to the destination account (defaults to <amount>; use it when the currencies differ)')
  .option('--fee <n>')
  .option('--desc <text>')
  .option('--date <iso>')
  .action(async (amount, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const ctx: TxCtx = { workspaceId, userId: session.user.id }
    const from = await resolveAccount(workspaceId, o.from)
    const to = await resolveAccount(workspaceId, o.to)
    // The app writes equal magnitudes here too, so this is not an error — but a UAH->USD transfer
    // crediting the same number is rarely what was meant.
    if (from.currency !== to.currency && o.toAmount == null)
      console.error(
        `⚠ transfer between different currencies (${from.currency} -> ${to.currency}): both legs get ${amount}. Pass --to-amount <sum in ${to.currency}> if the credited amount differs.`,
      )
    const t = buildTransfer(
      {
        amount: amt(amount),
        toAmount: parseNum(o.toAmount, 'to-amount'),
        fromId: from.id,
        toId: to.id,
        fee: parseNum(o.fee, 'fee') ?? 0,
        description: o.desc,
        date: dateToUnix(o.date),
      },
      ctx,
    )
    await saveTransaction(t)
    const credited = o.toAmount == null ? `${amount} ${to.currency}` : `${o.toAmount} ${to.currency}`
    console.log(`Transferred ${amount} ${from.currency} from ${from.name} -> ${credited} to ${to.name} (id ${t.id})`)
  })
