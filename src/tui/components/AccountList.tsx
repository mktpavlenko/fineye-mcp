import React from 'react'
import { Box, Text } from 'ink'
import { money, accountEmoji } from '../format.js'
import { GREEN } from '../theme.js'
import type { GroupedSection } from '../sections.js'
import { accountValue, accountValueInMain, type CryptoPrices } from '../../domain/valuation.js'
import { goalProgress } from '../../domain/goals.js'
import type { RateMap } from '../../domain/currency.js'
export const AccountList = ({
  sections,
  selectedId,
  focused,
  prices,
  main,
  rates,
}: {
  sections: GroupedSection[]
  selectedId: string
  focused: boolean
  prices: CryptoPrices
  main: string
  rates: RateMap
}) => (
  <Box flexDirection="column" borderStyle="round" borderColor={focused ? GREEN : 'gray'} paddingX={1} width={46}>
    <Text bold>ACCOUNTS</Text>
    {sections.map((s) => {
      const subtotal = s.accounts.reduce((sum, a) => sum + accountValueInMain(a, prices, main, rates), 0)
      return (
        <Box key={s.key} flexDirection="column">
          <Box justifyContent="space-between">
            <Text color={GREEN} bold>
              {s.emoji} {s.label}
            </Text>
            <Text dimColor>{money(subtotal, main)}</Text>
          </Box>
          {s.accounts.map((a) => {
            // debts can mix currencies -> show the main-currency value so the row matches the subtotal
            const v = a.type === 'debt' ? { value: accountValueInMain(a, prices, main, rates), currency: main } : accountValue(a, prices)
            return (
              <Text key={a.id} wrap="truncate-end" inverse={focused && a.id === selectedId}>
                {a.id === selectedId ? '▸ ' : '  '}
                {accountEmoji(a.type)} {a.name.slice(0, 14).padEnd(14)} <Text color="whiteBright">{money(v.value, v.currency)}</Text>
                {a.type === 'goal' && a.goal ? <Text dimColor> {goalProgress(a).pct.toFixed(0)}%</Text> : null}
              </Text>
            )
          })}
        </Box>
      )
    })}
  </Box>
)
