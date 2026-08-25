import React from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'
import BigText from 'ink-big-text'
import { sparkline } from '../sparkline.js'
import { money, amountColor } from '../format.js'
import { GREEN, GREEN_BRIGHT } from '../theme.js'
import { LOGO } from '../logo.js'
export const Header = ({ email, netWorth, currency, series }: { email: string; netWorth: number; currency: string; series: number[] }) => (
  <Box borderStyle="round" borderColor={GREEN} paddingX={1}>
    <Box marginRight={2} alignItems="center">
      <Text color={GREEN}>{LOGO}</Text>
    </Box>
    <Box flexDirection="column" flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={GREEN}>
          FINEYE
        </Text>
        <Text dimColor>{email}</Text>
      </Box>
      <Gradient colors={[GREEN, GREEN_BRIGHT]}>
        <BigText text={money(netWorth, currency)} font="tiny" />
      </Gradient>
      <Text color={amountColor(netWorth)}>
        NET WORTH <Text dimColor>{sparkline(series)} (30d)</Text>
      </Text>
    </Box>
  </Box>
)
