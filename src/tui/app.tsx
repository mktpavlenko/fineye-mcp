import React, { useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { loadSession } from '../auth/tokenStore.js'
import { getActiveWorkspace } from '../config.js'
import { resolveWorkspaceId } from '../domain/workspaces.js'
import { listAccounts } from '../domain/accounts.js'
import { listTransactions } from '../domain/transactions.js'
import { fetchRates, fetchCryptoPrices, safeConvert, type RateMap } from '../domain/currency.js'
import { computeNetWorth, fetchNetWorthSeries } from '../domain/networth.js'
import type { CryptoPrices } from '../domain/valuation.js'
import { spendByCategory, totals, avgPerDay, currentMonth, monthRange, normalizeToMain } from '../domain/analytics.js'
import { getBudgetPeriod, carryOverAmount } from '../domain/budgets.js'
import { listCategories } from '../domain/categories.js'
import { AnalyticsView } from './components/AnalyticsView.js'
import { getOne } from '../client.js'
import type { Account, Transaction, WorkspaceSettings, Category } from '../types.js'
import type { TxCtx } from '../domain/transactions.js'
import { Header } from './components/Header.js'
import { AccountList } from './components/AccountList.js'
import { TransactionList } from './components/TransactionList.js'
import { Footer } from './components/Footer.js'
import { Loading } from './components/Spinner.js'
import { AddTxModal } from './components/AddTxModal.js'
import { TabBar, TABS, type TabId } from './components/TabBar.js'
import { groupAccounts } from './sections.js'
import { GREEN } from './theme.js'
import { SCAN_LIMIT } from '../warn.js'

interface Data {
  accounts: Account[]
  allTx: Transaction[]
  series: number[]
  bars: { label: string; total: number }[]
  netWorth: number
  main: string
  email: string
  userId: string
  ctx: TxCtx
  categories: Category[]
  rates: RateMap
  prices: CryptoPrices
  monthTotals: { income: number; expense: number; net: number }
  budget: { total: number; spent: number; remaining: number; currency: string } | null
  avgDay: number
}

export const App = () => {
  const { exit } = useApp()
  const session = loadSession()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabId>('accounts')
  const [sel, setSel] = useState(0)
  const [txScroll, setTxScroll] = useState(0)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [modal, setModal] = useState(false)
  const [msg, setMsg] = useState<string | undefined>(undefined)

  async function loadAll() {
    if (!session) {
      setError('Not logged in. Run: fineye login')
      return
    }
    const ws = await resolveWorkspaceId(session.user.id)
    // Month analytics need the FULL month, not a slice of the 500 most recent rows
    // (allTx stays capped — it only feeds the browsing lists).
    const bounds = monthRange(currentMonth())
    const [accounts, rates, prices, settings, allTx, monthTx, cats, bp] = await Promise.all([
      listAccounts(ws),
      fetchRates(),
      fetchCryptoPrices(),
      getOne<WorkspaceSettings>('workspace_settings', { workspace_id: `eq.${ws}`, select: '*' }),
      listTransactions(ws, { limit: 500 }),
      listTransactions(ws, { from: bounds.from, to: bounds.to, limit: SCAN_LIMIT }),
      listCategories(ws),
      getBudgetPeriod(ws, currentMonth()),
    ])
    const main = settings?.main_currency ?? 'UAH'
    const includeIds = new Set(accounts.filter((a) => a.includeInTotal).map((a) => a.id))
    const series = await fetchNetWorthSeries(ws, main, rates, prices, 30, includeIds)
    const byId = new Map(cats.map((c) => [c.id, c.title]))
    const now = new Date()
    // Same rule as the `analytics` command: restate every leg in the main currency first,
    // otherwise a USD account's spend is added to a UAH one as if the numbers were comparable.
    const monthMain = normalizeToMain(monthTx, new Map(accounts.map((a) => [a.id, a.currency])), main, rates)
    const sums = spendByCategory(monthMain)
    const bars = Object.entries(sums)
      .map(([id, total]) => ({ label: byId.get(id) ?? 'uncategorized', total }))
      .filter((r) => r.total < 0)
      .sort((a, b) => a.total - b.total)
    const monthTotals = totals(monthMain)
    const budgetTotal = bp?.total_budget?.amount ?? 0
    const available = budgetTotal + carryOverAmount(bp) // rolled-over leftover raises the headroom
    // Spend is in the main currency; the budget carries its own — restate before comparing.
    const budgetCur = bp?.total_budget?.currency ?? main
    const spentInBudgetCur = safeConvert(monthTotals.expense, main, budgetCur, rates)
    const budget = bp?.total_budget
      ? { total: budgetTotal, spent: spentInBudgetCur, remaining: available - spentInBudgetCur, currency: budgetCur }
      : null
    const avgDay = avgPerDay(monthMain, now.getUTCDate())
    setData({
      accounts,
      allTx,
      series,
      bars,
      netWorth: computeNetWorth(accounts, main, rates, prices),
      main,
      email: session.user.email,
      userId: session.user.id,
      ctx: { workspaceId: ws, userId: session.user.id },
      categories: cats,
      rates,
      prices,
      monthTotals,
      budget,
      avgDay,
    })
  }

  useEffect(() => {
    loadAll().catch((e) => setError(String(e?.message ?? e)))
  }, [])

  useEffect(() => {
    if (!data) return
    const flat = groupAccounts(data.accounts).flat
    const acc = flat[sel]
    setTxns(acc ? data.allTx.filter((t) => t.movements.some((m) => m.account.id === acc.id)) : [])
  }, [sel, data])

  function refresh() {
    setMsg('refreshing…')
    loadAll()
      .then(() => setMsg(undefined))
      .catch((e) => setMsg(String(e?.message ?? e)))
  }

  useInput((input, key) => {
    if (modal) return // modal owns input while open
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
      return
    }
    if (!data) return
    if (key.tab) setTab((t) => TABS[(TABS.findIndex((x) => x.id === t) + 1) % TABS.length].id)
    if (input === '1') setTab('accounts')
    if (input === '2') setTab('transactions')
    if (input === '3') setTab('analytics')
    if (input === '4') setTab('settings')
    if (input === 'a') setModal(true)
    if (input === 'r') refresh()
    if (tab === 'accounts') {
      const max = groupAccounts(data.accounts).flat.length - 1
      if (key.upArrow) setSel((s) => Math.max(0, s - 1))
      if (key.downArrow) setSel((s) => Math.min(max, s + 1))
    }
    if (tab === 'transactions') {
      if (key.upArrow) setTxScroll((s) => Math.max(0, s - 1))
      if (key.downArrow) setTxScroll((s) => Math.min(Math.max(0, data.allTx.length - 15), s + 1))
    }
  })

  if (error) return <Text color="red">{error}</Text>
  if (!data) return <Loading label="Loading FinEye…" />

  if (modal) {
    return (
      <AddTxModal
        accounts={data.accounts}
        categories={data.categories}
        ctx={data.ctx}
        onDone={(id) => {
          setModal(false)
          setMsg(`added ${id.slice(0, 8)} — refreshing…`)
          refresh()
        }}
        onCancel={() => setModal(false)}
      />
    )
  }

  const grouped = groupAccounts(data.accounts)
  const acc = grouped.flat[sel]
  return (
    <Box flexDirection="column">
      <Header email={data.email} netWorth={data.netWorth} currency={data.main} series={data.series} />
      <Box marginY={0}>
        <TabBar active={tab} />
      </Box>
      {tab === 'accounts' && (
        <Box>
          <AccountList
            sections={grouped.sections}
            selectedId={acc?.id ?? ''}
            focused
            prices={data.prices}
            main={data.main}
            rates={data.rates}
          />
          <TransactionList title={acc?.name ?? ''} txns={txns} focused={false} />
        </Box>
      )}
      {tab === 'transactions' && (
        <TransactionList
          title={`All (${txScroll + 1}–${Math.min(data.allTx.length, txScroll + 15)} / ${data.allTx.length})`}
          txns={data.allTx.slice(txScroll, txScroll + 15)}
          focused
        />
      )}
      {tab === 'analytics' && (
        <AnalyticsView
          income={data.monthTotals.income}
          expense={data.monthTotals.expense}
          net={data.monthTotals.net}
          avgDay={data.avgDay}
          main={data.main}
          bars={data.bars}
          budget={data.budget}
        />
      )}
      {tab === 'settings' && (
        <Box flexDirection="column" borderStyle="round" borderColor={GREEN} paddingX={1}>
          <Text bold color={GREEN}>
            ◉ Settings
          </Text>
          <Text>Account: {data.email}</Text>
          <Text dimColor>User id: {data.userId}</Text>
          <Text>Workspace: {getActiveWorkspace() ?? data.ctx.workspaceId}</Text>
          <Text>Main currency: {data.main}</Text>
          <Text>
            Accounts: {data.accounts.length} Transactions loaded: {data.allTx.length}
          </Text>
          <Text dimColor>Logout: run `fineye logout` · Read-only agent: FINEYE_READONLY=1</Text>
        </Box>
      )}
      <Footer message={msg ?? '1-4/tab switch · ↑↓ navigate · a add · r refresh · q quit'} />
    </Box>
  )
}
