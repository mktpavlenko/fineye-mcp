import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import type { Account, Category } from '../../types.js'
import { buildExpense, buildIncome, buildTransfer, saveTransaction, type TxCtx } from '../../domain/transactions.js'
import { GREEN } from '../theme.js'
type Kind = 'expense' | 'income' | 'transfer'
type Step = 'type' | 'account' | 'from' | 'to' | 'category' | 'amount' | 'saving'
export const AddTxModal = ({
  accounts,
  categories,
  ctx,
  onDone,
  onCancel,
}: {
  accounts: Account[]
  categories: Category[]
  ctx: TxCtx
  onDone: (id: string) => void
  onCancel: () => void
}) => {
  const [step, setStep] = useState<Step>('type')
  const [kind, setKind] = useState<Kind>('expense')
  const [accId, setAccId] = useState('')
  const [toId, setToId] = useState('')
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  useInput((_i, key) => {
    if (key.escape) onCancel()
  })
  const accItems = accounts.map((a) => ({ label: `${a.name} (${a.currency})`, value: a.id }))
  const catItems = [{ label: '— none —', value: '' }, ...categories.map((c) => ({ label: c.title, value: c.id }))]
  async function save() {
    const n = Number(amount)
    if (!(n > 0)) {
      setError('amount must be a positive number')
      return
    }
    setStep('saving')
    try {
      const t =
        kind === 'transfer'
          ? buildTransfer({ amount: n, fromId: accId, toId }, ctx)
          : kind === 'expense'
            ? buildExpense({ amount: n, accountId: accId, categoryId: catId || undefined }, ctx)
            : buildIncome({ amount: n, accountId: accId, categoryId: catId || undefined }, ctx)
      await saveTransaction(t)
      onDone(t.id)
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setStep('amount')
    }
  }
  return (
    <Box flexDirection="column" borderStyle="double" borderColor={GREEN} paddingX={1}>
      <Text bold color={GREEN}>
        ◉ Add transaction <Text dimColor>(esc to cancel)</Text>
      </Text>
      {error && <Text color="red">{error}</Text>}
      {step === 'type' && (
        <SelectInput
          items={[
            { label: 'Expense', value: 'expense' },
            { label: 'Income', value: 'income' },
            { label: 'Transfer', value: 'transfer' },
          ]}
          onSelect={(it: { value: string }) => {
            const k = it.value as Kind
            setKind(k)
            setStep(k === 'transfer' ? 'from' : 'account')
          }}
        />
      )}
      {step === 'account' && (
        <Box flexDirection="column">
          <Text dimColor>Account:</Text>
          <SelectInput
            items={accItems}
            onSelect={(it: { value: string }) => {
              setAccId(it.value)
              setStep('category')
            }}
          />
        </Box>
      )}
      {step === 'from' && (
        <Box flexDirection="column">
          <Text dimColor>From account:</Text>
          <SelectInput
            items={accItems}
            onSelect={(it: { value: string }) => {
              setAccId(it.value)
              setStep('to')
            }}
          />
        </Box>
      )}
      {step === 'to' && (
        <Box flexDirection="column">
          <Text dimColor>To account:</Text>
          <SelectInput
            items={accItems.filter((a) => a.value !== accId)}
            onSelect={(it: { value: string }) => {
              setToId(it.value)
              setStep('amount')
            }}
          />
        </Box>
      )}
      {step === 'category' && (
        <Box flexDirection="column">
          <Text dimColor>Category:</Text>
          <SelectInput
            items={catItems}
            onSelect={(it: { value: string }) => {
              setCatId(it.value)
              setStep('amount')
            }}
          />
        </Box>
      )}
      {step === 'amount' && (
        <Box>
          <Text>{kind} amount: </Text>
          <TextInput value={amount} onChange={setAmount} onSubmit={save} />
        </Box>
      )}
      {step === 'saving' && <Text color={GREEN}>saving…</Text>}
    </Box>
  )
}
