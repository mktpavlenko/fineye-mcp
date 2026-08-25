import React from 'react'
import { Box, Text } from 'ink'
import type { Transaction } from '../../types.js'
import { amountColor } from '../format.js'
import { GREEN } from '../theme.js'
import { fmtUnixDate } from '../../util.js'
import { isScheduled } from '../../domain/transactions.js'
export const TransactionList = ({ title, txns, focused }: { title: string; txns: Transaction[]; focused: boolean }) => (
  <Box flexDirection="column" borderStyle="round" borderColor={focused ? GREEN : 'gray'} paddingX={1} flexGrow={1}>
    <Text bold>TRANSACTIONS · {title}</Text>
    {txns.length === 0 && <Text dimColor>no transactions</Text>}
    {txns.slice(0, 15).map((t) => {
      const single = t.movements.length === 1
      const amt = single ? t.movements[0].sum : -(t.movements.find((m) => m.sum < 0)?.sum ?? 0)
      const date = fmtUnixDate(t.time, 'md')
      return (
        <Text key={t.id}>
          {date} <Text color={single ? amountColor(amt) : 'gray'}>{String(amt).padStart(10)}</Text>
          {'  '}
          {(t.description ?? '').slice(0, 24)}
          {isScheduled(t) && <Text dimColor> ⏳</Text>}
        </Text>
      )
    })}
  </Box>
)
