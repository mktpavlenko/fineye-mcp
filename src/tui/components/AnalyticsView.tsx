import React from 'react'
import { Box, Text } from 'ink'
import { GREEN } from '../theme.js'
import { SpendBars } from './SpendBars.js'
export const AnalyticsView = ({
  income,
  expense,
  net,
  avgDay,
  main,
  bars,
  budget,
}: {
  income: number
  expense: number
  net: number
  avgDay: number
  main: string
  bars: { label: string; total: number }[]
  budget: { total: number; spent: number; remaining: number; currency: string } | null
}) => (
  <Box flexDirection="column" borderStyle="round" borderColor={GREEN} paddingX={1}>
    <Text bold color={GREEN}>
      ◉ Analytics · цей місяць
    </Text>
    <Box>
      <Text color="green">Дохід +{Math.round(income)}</Text>
      <Text dimColor> · </Text>
      <Text color="red">Витрати -{Math.round(expense)}</Text>
      <Text dimColor> · </Text>
      <Text>
        Net {Math.round(net)} {main}
      </Text>
    </Box>
    <Text dimColor>
      витрати {income ? ((expense / income) * 100).toFixed(0) : '∞'}% доходу · серед./день {Math.round(avgDay)} {main}
    </Text>
    <SpendBars rows={bars} />
    {budget && (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>БЮДЖЕТ</Text>
        <Text>
          {Math.round(budget.spent)}/{budget.total} {budget.currency} · залишок{' '}
          <Text color={budget.remaining < 0 ? 'red' : 'green'}>{Math.round(budget.remaining)}</Text>{' '}
          <Text dimColor>({budget.total ? ((budget.spent / budget.total) * 100).toFixed(0) : '0'}%)</Text>
        </Text>
      </Box>
    )}
  </Box>
)
