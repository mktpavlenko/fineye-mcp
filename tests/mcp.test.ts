import { describe, it, expect, vi, afterEach } from 'vitest'
import { fakeServer, json, WS } from './_mcpHarness.js'
import * as shared from '../src/commands/_shared.js'
import * as client from '../src/client.js'
import * as accounts from '../src/domain/accounts.js'
import * as categories from '../src/domain/categories.js'
import * as workspaces from '../src/domain/workspaces.js'
import * as transactions from '../src/domain/transactions.js'
import { registerRead } from '../src/mcp/tools/read.js'
import { registerWrite } from '../src/mcp/tools/write.js'
import { registerDestructive } from '../src/mcp/tools/destructive.js'
import { registerRules } from '../src/mcp/tools/rules.js'
import * as rules from '../src/domain/rules.js'
import { buildServer } from '../src/mcp/server.js'
import { registrars } from '../src/mcp/tools/registry.js'
import * as tags from '../src/domain/tags.js'
import * as budgets from '../src/domain/budgets.js'
import * as notifications from '../src/domain/notifications.js'
import * as networth from '../src/domain/networth.js'
import * as currency from '../src/domain/currency.js'
import * as bulkDomain from '../src/domain/bulk.js'
import { registerPlaybooks } from '../src/mcp/tools/playbooks.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
const tx = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    time: '1786600000',
    description: 'Coffee',
    category: null,
    tags: null,
    person: null,
    movements: [{ sum: -30, fee: 0, account: { id: 'a1' }, invoice: null }],
    ...over,
  }) as any
const ws = () => vi.spyOn(shared, 'requireWorkspace').mockResolvedValue(WS)

describe('read tools', () => {
  // The MCP equivalent of `whoami`: an agent has no other way to check WHICH FinEye account it is
  // acting on, and every other tool silently uses the active workspace.
  it('fineye_workspaces identifies the account and the active workspace', async () => {
    ws()
    vi.spyOn(workspaces, 'listWorkspaces').mockResolvedValue([{ workspace_id: 'w1', role: 'owner' }] as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    const out = json(await tools['fineye_workspaces']({}))
    expect(out.account.email).toBe('e@x')
    expect(out.activeWorkspace).toBe('w1')
    expect(out.note).toBeUndefined() // single workspace: nothing is unreachable
  })

  it('says so when other workspaces exist but are out of reach', async () => {
    ws()
    vi.spyOn(workspaces, 'listWorkspaces').mockResolvedValue([{ workspace_id: 'w1' }, { workspace_id: 'w2' }] as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    expect(json(await tools['fineye_workspaces']({})).note).toMatch(/only the active workspace/)
  })

  it('fineye_accounts returns the account list', async () => {
    ws()
    vi.spyOn(accounts, 'listAccounts').mockResolvedValue([{ id: 'a1', name: 'Кеш', currency: 'UAH' }] as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    expect(json(await tools['fineye_accounts']({ view: 'list', includeArchived: false }))[0].name).toBe('Кеш')
  })

  it('fineye_transactions surfaces a truncation warning as data, not stderr', async () => {
    ws()
    vi.spyOn(transactions, 'listTransactions').mockImplementation(async (_w, _f, warn) => {
      warn?.('the result hit the 100000-row cap — totals may be incomplete')
      return [tx('t1')]
    })
    const { server, tools } = fakeServer()
    registerRead(server)
    const out = json(await tools['fineye_transactions']({ limit: 100000 }))
    expect(out.warnings[0]).toMatch(/100000-row cap/)
  })

  it('reports a missing transaction as code=not_found, not a bare string', async () => {
    ws()
    vi.spyOn(transactions, 'getTransactionById').mockResolvedValue(null)
    const { server, tools } = fakeServer()
    registerRead(server)
    const r = await tools['fineye_transactions']({ id: 'nope', limit: 100 })
    expect(r.isError).toBe(true)
    expect(json(r).error.code).toBe('not_found')
  })
})

describe('destructive tools', () => {
  it('fineye_delete without confirm previews and deletes nothing', async () => {
    ws()
    vi.spyOn(transactions, 'getTransactionById').mockResolvedValue(tx('t1'))
    const spy = vi.spyOn(transactions, 'deleteTransaction').mockResolvedValue(undefined)
    const { server, tools } = fakeServer()
    registerDestructive(server)
    const out = json(await tools['fineye_delete']({ kind: 'transaction', id: 't1', confirm: false }))
    expect(out.dryRun).toBe(true)
    expect(out.wouldDelete.id).toBe('t1')
    expect(spy).not.toHaveBeenCalled()
  })

  it('fineye_delete with confirm but no FINEYE_DELETE is refused by the gate', async () => {
    ws()
    vi.stubEnv('FINEYE_DELETE', '')
    vi.spyOn(transactions, 'getTransactionById').mockResolvedValue(tx('t1'))
    const { server, tools } = fakeServer()
    registerDestructive(server)
    const r = await tools['fineye_delete']({ kind: 'transaction', id: 't1', confirm: true })
    expect(r.isError).toBe(true)
    expect(json(r).error.code).toBe('gate')
  })

  it('fineye_bulk needs BOTH apply and confirm before it deletes', async () => {
    ws()
    vi.stubEnv('FINEYE_DELETE', '1')
    vi.spyOn(client, 'get').mockResolvedValue([
      tx('t1'),
      tx('t2', { movements: [{ sum: -1, fee: 0, account: { id: 'a1' }, invoice: null, status: 'scheduled' }] }),
    ] as any)
    const spy = vi.spyOn(transactions, 'deleteTransaction').mockResolvedValue(undefined)
    const { server, tools } = fakeServer()
    registerDestructive(server)
    const applyOnly = json(
      await tools['fineye_bulk']({ action: 'delete-transactions', search: 'x', apply: true, confirm: false, includeScheduled: false }),
    )
    expect(applyOnly.dryRun).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    // and the scheduled installment is held back from the matched set
    expect(applyOnly.matched).toBe(1)
    expect(applyOnly.skippedScheduled).toBe(1)
  })

  it('fineye_bulk refuses a selection-less run', async () => {
    ws()
    const { server, tools } = fakeServer()
    registerDestructive(server)
    const r = await tools['fineye_bulk']({ action: 'delete-transactions', apply: false, confirm: false, includeScheduled: false })
    expect(json(r).error.code).toBe('gate')
  })
})

describe('write tools', () => {
  it('fineye_tx refuses to categorize a transfer, and still allows clearing one', async () => {
    ws()
    const twoLeg = tx('t1', {
      movements: [
        { sum: -50, account: { id: 'a1' } },
        { sum: 50, account: { id: 'a2' } },
      ],
    })
    vi.spyOn(transactions, 'getTransactionById').mockResolvedValue(twoLeg)
    vi.spyOn(categories, 'resolveCategory').mockResolvedValue({ id: 'cat-food', title: 'Їжа' } as any)
    const edit = vi.spyOn(transactions, 'editTransaction').mockImplementation(async () => twoLeg)
    const { server, tools } = fakeServer()
    registerWrite(server)
    const r = await tools['fineye_tx']({ action: 'edit', id: 't1', category: 'Їжа' })
    expect(json(r).error.code).toBe('invalid')
    expect(edit).not.toHaveBeenCalled()
    await tools['fineye_tx']({ action: 'edit', id: 't1', clearCategory: true })
    expect(edit).toHaveBeenCalledWith('t1', { category: null })
  })

  it('fineye_add rejects a transfer without both accounts before touching the network', async () => {
    ws()
    const spy = vi.spyOn(transactions, 'saveTransaction')
    const { server, tools } = fakeServer()
    registerWrite(server)
    const r = await tools['fineye_add']({ type: 'transfer', amount: 10, from: 'Кеш' })
    expect(json(r).error.code).toBe('invalid')
    expect(spy).not.toHaveBeenCalled()
  })

  it('fineye_add flags a cross-currency transfer that credited the same number to both legs', async () => {
    ws()
    vi.spyOn(accounts, 'resolveAccount').mockImplementation(async (_w, n) =>
      n === 'Кеш' ? ({ id: 'a1', name: 'Кеш', currency: 'UAH' } as any) : ({ id: 'a2', name: 'ZEN', currency: 'USD' } as any),
    )
    vi.spyOn(transactions, 'saveTransaction').mockImplementation(async (t) => t)
    const { server, tools } = fakeServer()
    registerWrite(server)
    const out = json(await tools['fineye_add']({ type: 'transfer', amount: 100, from: 'Кеш', to: 'ZEN' }))
    expect(out.from.sum).toBe(-100)
    expect(out.to.sum).toBe(100)
    expect(out.note).toMatch(/pass toAmount/)
  })
})

// Every one of these is a defect a code review found: a missing argument that read as "delete
// it", a spend breakdown carrying income, a stdout guard with holes.
describe('review findings', () => {
  it('fineye_account debt refuses to treat a missing amount as "clear the entry"', async () => {
    ws()
    vi.spyOn(accounts, 'resolveAccount').mockResolvedValue({ id: 'a1', name: 'Борг' } as any)
    const spy = vi.spyOn(accounts, 'setDebt').mockResolvedValue({ id: 'a1' } as any)
    const { server, tools } = fakeServer()
    registerWrite(server)
    expect(json(await tools['fineye_account']({ action: 'debt', account: 'Борг', currency: 'USD' })).error.code).toBe('invalid')
    expect(spy).not.toHaveBeenCalled()
    await tools['fineye_account']({ action: 'debt', account: 'Борг', currency: 'USD', remove: true })
    expect(spy).toHaveBeenCalledWith('a1', 'USD', null) // removal still works when asked for
  })

  it('fineye_tx recurring refuses to treat a missing frequency as "clear the series"', async () => {
    ws()
    const spy = vi.spyOn(transactions, 'setRecurring').mockResolvedValue(tx('t1'))
    const { server, tools } = fakeServer()
    registerWrite(server)
    expect(json(await tools['fineye_tx']({ action: 'recurring', id: 't1' })).error.code).toBe('invalid')
    expect(spy).not.toHaveBeenCalled()
    await tools['fineye_tx']({ action: 'recurring', id: 't1', frequency: null })
    expect(spy).toHaveBeenCalledWith('w1', 't1', null) // explicit null still clears
  })

  it('fineye_analytics keeps income categories out of the SPEND breakdown', async () => {
    ws()
    vi.spyOn(transactions, 'listTransactions').mockResolvedValue([
      tx('e1', { category: 'c-food', movements: [{ sum: -100, fee: 0, account: { id: 'a1' }, invoice: null }] }),
      tx('i1', { category: 'c-salary', movements: [{ sum: 5000, fee: 0, account: { id: 'a1' }, invoice: null }] }),
    ] as any)
    vi.spyOn(categories, 'listCategories').mockResolvedValue([
      { id: 'c-food', title: 'Їжа' },
      { id: 'c-salary', title: 'Зарплата' },
    ] as any)
    vi.spyOn(shared, 'fxContext').mockResolvedValue({
      main: 'UAH',
      financialMonthStart: 1,
      rates: {},
      toMain: (t: unknown) => t,
      fromMain: (n: number) => n,
    } as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    const out = json(await tools['fineye_analytics']({ groupBy: 'category', top: 20, all: true }))
    expect(out.breakdown.map((b: { key: string }) => b.key)).toEqual(['Їжа'])
    expect(out.income).toBe(5000) // income still reported as a total, just not as "spend"
  })

  it('fineye_account add applies the toggles it accepts instead of dropping them', async () => {
    ws()
    vi.spyOn(accounts, 'createAccount').mockResolvedValue({ id: 'new1', name: 'Заначка', includeInTotal: true, savings: false } as any)
    const edit = vi.spyOn(accounts, 'editAccount').mockResolvedValue({ id: 'new1', includeInTotal: false, savings: true } as any)
    const { server, tools } = fakeServer()
    registerWrite(server)
    // createAccount hardcodes these, so without the follow-up the call would report success for an
    // account that ignored half the request
    const out = json(await tools['fineye_account']({ action: 'add', name: 'Заначка', savings: true, includeInTotal: false }))
    expect(edit).toHaveBeenCalledWith('new1', { includeInTotal: false, savings: true })
    expect(out.savings).toBe(true)
  })

  it('fineye_account add skips the extra write when no toggle was asked for', async () => {
    ws()
    vi.spyOn(accounts, 'createAccount').mockResolvedValue({ id: 'new2', name: 'Кеш2' } as any)
    const edit = vi.spyOn(accounts, 'editAccount')
    const { server, tools } = fakeServer()
    registerWrite(server)
    await tools['fineye_account']({ action: 'add', name: 'Кеш2' })
    expect(edit).not.toHaveBeenCalled()
  })

  it('fineye_rules reports a missing category as invalid, not as a missing rule', async () => {
    ws()
    vi.spyOn(rules, 'getOverrides').mockResolvedValue([])
    vi.spyOn(categories, 'listCategories').mockResolvedValue([] as any)
    const { server, tools } = fakeServer()
    registerRules(server)
    expect(json(await tools['fineye_rules']({ action: 'edit', id: 'r1' })).error.code).toBe('invalid')
  })
})

describe('stdout guard', () => {
  // stdout carries the MCP protocol. console.log was redirected but console.info/debug/dir were
  // left pointing at it, so one stray call from any dependency corrupts the stream — and it
  // presents as a broken client, not as a stray print.
  it('redirects every console method that writes to stdout', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/mcp/server.ts', 'utf8'))
    for (const m of ['log', 'info', 'debug', 'dir']) expect(src).toMatch(new RegExp(`console\\.${m} =`))
  })
})

describe('server assembly', () => {
  it('registers every tool under a unique fineye_ name', () => {
    const { server, tools, configs } = fakeServer()
    for (const r of registrars()) r(server)
    const names = Object.keys(tools)
    expect(names.length).toBe(20) // exact: a silently dropped registration must fail the build
    expect(names.every((n) => n.startsWith('fineye_'))).toBe(true)
    // every destructive tool must actually declare itself destructive to the client
    expect(configs['fineye_delete'].annotations.destructiveHint).toBe(true)
    expect(configs['fineye_bulk'].annotations.destructiveHint).toBe(true)
    expect(configs['fineye_accounts'].annotations.readOnlyHint).toBe(true)
  })

  it('read-only mode does not even register the write tools', () => {
    vi.stubEnv('FINEYE_READONLY', '1')
    const { server, tools } = fakeServer()
    for (const r of registrars()) r(server)
    expect(tools['fineye_accounts']).toBeDefined()
    expect(tools['fineye_delete']).toBeUndefined()
    expect(tools['fineye_add']).toBeUndefined()
  })

  // Listing rules is a read; only add/edit are writes. A read-only server that could not read them
  // would be hiding data for no reason.
  it('read-only mode still exposes fineye_rules, narrowed to list', () => {
    vi.stubEnv('FINEYE_READONLY', '1')
    const { server, tools, configs } = fakeServer()
    for (const r of registrars()) r(server)
    expect(tools['fineye_rules']).toBeDefined()
    expect(configs['fineye_rules'].annotations.readOnlyHint).toBe(true)
    expect(configs['fineye_rules'].inputSchema.action.safeParse('list').success).toBe(true)
    expect(configs['fineye_rules'].inputSchema.action.safeParse('add').success).toBe(false)
  })

  it('read-write mode offers the full rules action set', () => {
    const { server, configs } = fakeServer()
    for (const r of registrars()) r(server)
    for (const a of ['list', 'add', 'edit']) expect(configs['fineye_rules'].inputSchema.action.safeParse(a).success).toBe(true)
    expect(configs['fineye_rules'].annotations.readOnlyHint).toBe(false)
  })

  it('buildServer wires up without throwing', () => {
    expect(buildServer()).toBeDefined()
  })
})

// Fixes from the 2026-08-25 live audit: every test here pins a behavior an agent got (or would
// have gotten) silently wrong — a name filter matching nothing, a sub-category misfiled as
// expense, an unbounded inline export.
describe('audit fixes', () => {
  it('fineye_transactions resolves account/category NAMES in filters instead of silently matching nothing', async () => {
    ws()
    vi.spyOn(accounts, 'resolveAccount').mockResolvedValue({ id: 'a1', name: 'black' } as any)
    vi.spyOn(categories, 'resolveCategory').mockResolvedValue({ id: 'c1', title: 'Їжа' } as any)
    const list = vi.spyOn(transactions, 'listTransactions').mockResolvedValue([])
    const { server, tools } = fakeServer()
    registerRead(server)
    await tools['fineye_transactions']({ account: 'black', category: 'Їжа', limit: 100 })
    expect(list).toHaveBeenCalledWith('w1', expect.objectContaining({ account: 'a1', category: 'c1' }), expect.any(Function))
  })

  it('fineye_bulk resolves filter names the same way', async () => {
    ws()
    vi.spyOn(accounts, 'resolveAccount').mockResolvedValue({ id: 'a1', name: 'black' } as any)
    const sel = vi.spyOn(bulkDomain, 'selectTransactions').mockResolvedValue([])
    const { server, tools } = fakeServer()
    registerDestructive(server)
    await tools['fineye_bulk']({ action: 'delete-transactions', account: 'black', apply: false, confirm: false, includeScheduled: false })
    expect(sel).toHaveBeenCalledWith('w1', expect.objectContaining({ account: 'a1' }), expect.any(Function))
  })

  it('fineye_category add inherits the parent type like the CLI does', async () => {
    ws()
    vi.spyOn(categories, 'resolveCategory').mockResolvedValue({ id: 'p1', title: 'Дохід', type: 'income' } as any)
    const save = vi.spyOn(categories, 'saveCategory').mockImplementation(async (c) => c as any)
    const { server, tools } = fakeServer()
    registerWrite(server)
    await tools['fineye_category']({ action: 'add', title: 'Бонуси', parent: 'Дохід' })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', parent: 'p1' }))
  })

  it('fineye_analytics takes an arbitrary from/to window and refuses month+window', async () => {
    ws()
    const list = vi.spyOn(transactions, 'listTransactions').mockResolvedValue([])
    vi.spyOn(categories, 'listCategories').mockResolvedValue([] as any)
    vi.spyOn(shared, 'fxContext').mockResolvedValue({
      main: 'UAH',
      financialMonthStart: 1,
      toMain: (t: unknown) => t,
      fromMain: (n: number) => n,
    } as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    const out = json(await tools['fineye_analytics']({ from: '2026-08-01', to: '2026-08-07', groupBy: 'category', top: 20, all: false }))
    expect(out.period).toBe('2026-08-01..2026-08-07')
    expect(list).toHaveBeenCalledWith('w1', expect.objectContaining({ from: '2026-08-01', to: '2026-08-07' }), expect.any(Function))
    const r = await tools['fineye_analytics']({ month: '2026-08', from: '2026-08-01', groupBy: 'category', top: 20, all: false })
    expect(json(r).error.code).toBe('invalid')
  })

  it('fineye_networth threads `days` into the history series', async () => {
    ws()
    vi.spyOn(accounts, 'listAccounts').mockResolvedValue([{ id: 'a1', name: 'Кеш', includeInTotal: true }] as any)
    vi.spyOn(currency, 'fetchRates').mockResolvedValue({} as any)
    vi.spyOn(currency, 'fetchCryptoPrices').mockResolvedValue({} as any)
    vi.spyOn(shared, 'fxContext').mockResolvedValue({ main: 'UAH' } as any)
    vi.spyOn(networth, 'computeNetWorth').mockReturnValue(0)
    const series = vi.spyOn(networth, 'fetchNetWorthSeries').mockResolvedValue([1, 2])
    const { server, tools } = fakeServer()
    registerRead(server)
    await tools['fineye_networth']({ history: true, days: 90 })
    expect(series).toHaveBeenCalledWith('w1', 'UAH', {}, {}, 90, expect.any(Set), expect.any(Function))
  })

  it('fineye_export caps the inline dump with `limit`', async () => {
    ws()
    const list = vi.spyOn(transactions, 'listTransactions').mockResolvedValue([])
    vi.spyOn(accounts, 'listAccounts').mockResolvedValue([] as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    await tools['fineye_export']({ format: 'csv', limit: 50 })
    expect(list).toHaveBeenCalledWith('w1', expect.objectContaining({ limit: 50 }), expect.any(Function))
  })

  it('fineye_rules edit refuses merchant/mcc instead of silently ignoring them', async () => {
    ws()
    vi.spyOn(categories, 'listCategories').mockResolvedValue([] as any)
    vi.spyOn(rules, 'getOverrides').mockResolvedValue([])
    const { server, tools } = fakeServer()
    registerRules(server)
    const r = await tools['fineye_rules']({ action: 'edit', id: 'r1', category: 'Їжа', merchant: 'Крамниця' })
    expect(json(r).error.code).toBe('invalid')
  })

  it('fineye_delete with confirm AND FINEYE_DELETE=1 actually deletes', async () => {
    ws()
    vi.stubEnv('FINEYE_DELETE', '1')
    vi.spyOn(transactions, 'getTransactionById').mockResolvedValue(tx('t1'))
    const del = vi.spyOn(transactions, 'deleteTransaction').mockResolvedValue(undefined)
    const { server, tools } = fakeServer()
    registerDestructive(server)
    const out = json(await tools['fineye_delete']({ kind: 'transaction', id: 't1', confirm: true }))
    expect(del).toHaveBeenCalledWith('t1')
    expect(out.deleted.id).toBe('t1')
  })

  it('fineye_bulk delete path reports done/failed and the backup it wrote', async () => {
    ws()
    vi.stubEnv('FINEYE_DELETE', '1')
    vi.spyOn(client, 'get').mockResolvedValue([tx('t1')] as any)
    const bak = vi.spyOn(bulkDomain, 'backup').mockReturnValue('/tmp/fineye-test-backup.json')
    const del = vi.spyOn(transactions, 'deleteTransaction').mockResolvedValue(undefined)
    const { server, tools } = fakeServer()
    registerDestructive(server)
    const out = json(
      await tools['fineye_bulk']({ action: 'delete-transactions', search: 'Coffee', apply: true, confirm: true, includeScheduled: false }),
    )
    expect(out.done).toBe(1)
    expect(out.failed).toEqual([])
    expect(out.backup).toBe('/tmp/fineye-test-backup.json')
    expect(del).toHaveBeenCalledWith('t1')
    expect(bak).toHaveBeenCalled()
  })
})

// The nine tools the original suite never invoked — wrapper bugs are exactly what handler tests
// catch, so each gets at least its distinctive behavior pinned.
describe('handler coverage', () => {
  it('fineye_budget show reports spent/remaining, and a no-budget note when the period is empty', async () => {
    ws()
    vi.spyOn(shared, 'fxContext').mockResolvedValue({
      main: 'UAH',
      financialMonthStart: 1,
      toMain: (t: unknown) => t,
      fromMain: (n: number) => n,
    } as any)
    vi.spyOn(budgets, 'getBudgetPeriod').mockResolvedValue({
      period_key: '2026-08',
      total_budget: { amount: 100, currency: 'UAH' },
      carry_over_mode: 'none',
    } as any)
    vi.spyOn(transactions, 'listTransactions').mockResolvedValue([
      tx('e1', { movements: [{ sum: -40, fee: 0, account: { id: 'a1' }, invoice: null }] }),
    ] as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    const out = json(await tools['fineye_budget']({ action: 'show', month: '2026-08', limit: 12 }))
    expect(out).toMatchObject({ period: '2026-08', budget: 100, spent: 40, remaining: 60 })
    vi.spyOn(budgets, 'getBudgetPeriod').mockResolvedValue(null)
    expect(json(await tools['fineye_budget']({ action: 'show', month: '2026-01', limit: 12 })).note).toMatch(/no budget/)
  })

  it('fineye_categories maps parentTitle and hides archived by default', async () => {
    ws()
    vi.spyOn(categories, 'listCategories').mockResolvedValue([
      { id: 'p1', title: 'Їжа', parent: null, archived_at: null },
      { id: 'c1', title: 'Кава', parent: 'p1', archived_at: null },
      { id: 'old', title: 'Стара', parent: null, archived_at: '2026-01-01' },
    ] as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    const out = json(await tools['fineye_categories']({ includeArchived: false }))
    expect(out.map((c: { id: string }) => c.id)).toEqual(['p1', 'c1'])
    expect(out[1].parentTitle).toBe('Їжа')
    expect(json(await tools['fineye_categories']({ includeArchived: true })).length).toBe(3)
  })

  it('fineye_tags and fineye_notifications pass their lists through', async () => {
    ws()
    vi.spyOn(tags, 'listTags').mockResolvedValue([{ id: 'g1', name: 'відпустка' }] as any)
    vi.spyOn(notifications, 'listNotifications').mockResolvedValue([{ id: 'n1', title: 'Update' }] as any)
    const { server, tools } = fakeServer()
    registerRead(server)
    expect(json(await tools['fineye_tags']({}))[0].name).toBe('відпустка')
    expect(json(await tools['fineye_notifications']({}))[0].title).toBe('Update')
  })

  it('fineye_tag rejects a case-insensitive duplicate name, and rename without id', async () => {
    ws()
    vi.spyOn(tags, 'listTags').mockResolvedValue([{ id: 'g1', name: 'Відпустка' }] as any)
    const save = vi.spyOn(tags, 'saveTag')
    const { server, tools } = fakeServer()
    registerWrite(server)
    expect(json(await tools['fineye_tag']({ action: 'add', name: 'відпустка' })).error.code).toBe('invalid')
    expect(json(await tools['fineye_tag']({ action: 'rename', name: 'x' })).error.code).toBe('invalid')
    expect(save).not.toHaveBeenCalled()
  })

  it('fineye_budget_set validates carry-over and echoes what it overwrote', async () => {
    ws()
    vi.spyOn(shared, 'fxContext').mockResolvedValue({ main: 'UAH' } as any)
    vi.spyOn(budgets, 'getBudgetPeriod').mockResolvedValue({ total_budget: { amount: 50, currency: 'UAH' } } as any)
    const set = vi.spyOn(budgets, 'setBudgetPeriod').mockResolvedValue({
      total_budget: { amount: 100, currency: 'UAH' },
      carry_over_mode: 'none',
    } as any)
    const { server, tools } = fakeServer()
    registerWrite(server)
    expect(json(await tools['fineye_budget_set']({ amount: 100, carryOver: 'percent' })).error.code).toBe('invalid')
    expect(set).not.toHaveBeenCalled()
    const out = json(await tools['fineye_budget_set']({ amount: 100, month: '2026-08' }))
    expect(out.previous).toEqual({ amount: 50, currency: 'UAH' })
    expect(out.budget).toEqual({ amount: 100, currency: 'UAH' })
  })
})

describe('playbooks', () => {
  it('lists without a topic, returns one body with it, and errors on an unknown id', async () => {
    const { server, tools, resources } = fakeServer()
    registerPlaybooks(server)
    const list = json(await tools['fineye_playbook']({}))
    expect(list.playbooks.length).toBeGreaterThan(0)
    const first = list.playbooks[0].id
    expect(json(await tools['fineye_playbook']({ topic: first })).playbook).toContain('#')
    expect(json(await tools['fineye_playbook']({ topic: 'nope' })).error.code).toBe('not_found')
    // every playbook is also reachable the protocol's own way
    expect(Object.keys(resources).sort()).toEqual(list.playbooks.map((p: { id: string }) => p.id).sort())
  })
})
