import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { listAccounts, editAccount, resolveAccount, createAccount, setHolding, setDebt } from '../domain/accounts.js'
import { output } from '../render.js'
import { parseNum } from '../util.js'
import { FineyeError } from '../errors.js'
export const accountsCmd = new Command('accounts')
  .description('List accounts and balances')
  .option('--archived', 'include archived')
  .option('--json', 'json output')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const accts = await listAccounts(workspaceId, !!o.archived)
    if (o.json) {
      console.log(JSON.stringify(accts, null, 2)) // full raw accounts (id, type, balance, crypto/debts…) for agents/scripts
      return
    }
    output(
      accts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: a.balance,
        currency: a.currency,
        type: a.type,
        bank: a.company ?? '',
        archived: a.archived,
      })),
      false,
      ['id', 'name', 'balance', 'currency', 'type', 'bank', 'archived'],
    )
  })
export const accountCmd = new Command('account').description('Create / edit accounts')
accountCmd
  .command('add <name>')
  .option('--type <type>', 'cash|ccard|savings|...', 'cash')
  .option('--currency <cur>', 'currency code', 'UAH')
  .option('--balance <n>', 'starting balance', '0')
  .option('--emoji <emoji>')
  .option('--goal <amount>', 'target amount (for a goal account; use with --type goal)')
  .action(async (name, o) => {
    const { session, workspaceId } = await requireWorkspace()
    const acc = await createAccount({
      workspace_id: workspaceId,
      user_id: session.user.id,
      name,
      type: o.type,
      currency: o.currency,
      balance: parseNum(o.balance, 'balance') ?? 0,
      emoji: o.emoji,
      goal: parseNum(o.goal, 'goal'),
    })
    console.log(`Created account ${acc.name} (${acc.id})`)
  })
accountCmd
  .command('edit <idOrName>')
  .option('--name <name>')
  .option('--emoji <emoji>')
  .option('--goal <amount>', 'target amount for a goal account')
  .option('--credit-limit <amount>')
  .option('--include-in-total')
  .option('--exclude-from-total')
  .option('--include-in-analytics')
  .option('--exclude-from-analytics')
  .option('--mark-savings')
  .option('--unmark-savings')
  .option('--archive')
  .option('--unarchive')
  .action(async (idOrName, o) => {
    const { workspaceId } = await requireWorkspace()
    const acc = await resolveAccount(workspaceId, idOrName)
    const fields: any = {}
    if (o.name) fields.name = o.name
    if (o.emoji) fields.emoji = o.emoji
    if (o.goal !== undefined) fields.goal = parseNum(o.goal, 'goal')
    if (o.creditLimit !== undefined) fields.creditLimit = parseNum(o.creditLimit, 'credit-limit')
    if (o.includeInTotal) fields.includeInTotal = true
    if (o.excludeFromTotal) fields.includeInTotal = false
    if (o.includeInAnalytics) fields.includeInAnalytics = true
    if (o.excludeFromAnalytics) fields.includeInAnalytics = false
    if (o.markSavings) fields.savings = true
    if (o.unmarkSavings) fields.savings = false
    if (o.archive) fields.archived = true
    if (o.unarchive) fields.archived = false
    if (Object.keys(fields).length === 0) throw new FineyeError('Nothing to edit', 'invalid')
    const updated = await editAccount(acc.id, fields)
    console.log(`Updated account ${updated.name}`)
  })
accountCmd
  .command('holding <idOrName>')
  .description('Set or remove a crypto/stocks holding on an account')
  .requiredOption('--symbol <id>', 'coin id (crypto, e.g. bitcoin) or ticker (stocks, e.g. VOO)')
  .option('--qty <n>', 'quantity held')
  .option('--avg-price <n>', 'average buy price')
  .option('--stocks', 'operate on stocks instead of crypto')
  .option('--remove', 'remove this holding')
  .action(async (idOrName, o) => {
    const { workspaceId } = await requireWorkspace()
    const acc = await resolveAccount(workspaceId, idOrName)
    const kind: 'crypto' | 'stocks' = o.stocks ? 'stocks' : 'crypto'
    if (o.remove) {
      await setHolding(acc.id, kind, o.symbol, null)
      console.log(`Removed ${kind} holding ${o.symbol} from ${acc.name}`)
      return
    }
    const qty = parseNum(o.qty, 'qty')
    if (qty == null) throw new FineyeError('--qty is required (or use --remove)', 'invalid')
    await setHolding(acc.id, kind, o.symbol, { quantity: qty, avg_price: parseNum(o.avgPrice, 'avg-price') })
    console.log(`Set ${kind} holding ${o.symbol}: qty ${qty} on ${acc.name}`)
  })
accountCmd
  .command('debt <idOrName>')
  .description('Set or remove a debt-ledger entry (amount per currency) on a debt account')
  .requiredOption('--currency <code>', 'currency code, e.g. UAH')
  .option('--amount <n>', 'amount owed (negative = owed to you, per FinEye)')
  .option('--remove', 'remove this currency entry')
  .action(async (idOrName, o) => {
    const { workspaceId } = await requireWorkspace()
    const acc = await resolveAccount(workspaceId, idOrName)
    if (o.remove) {
      await setDebt(acc.id, o.currency, null)
      console.log(`Removed ${o.currency} debt entry from ${acc.name}`)
      return
    }
    const amount = parseNum(o.amount, 'amount')
    if (amount == null) throw new FineyeError('--amount is required (or use --remove)', 'invalid')
    await setDebt(acc.id, o.currency, amount)
    console.log(`Set debt ${acc.name}: ${o.currency} = ${amount}`)
  })
