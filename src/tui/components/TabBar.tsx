import React from 'react'
import { Box, Text } from 'ink'
import { GREEN } from '../theme.js'
export type TabId = 'accounts' | 'transactions' | 'analytics' | 'settings'
export const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'accounts', icon: '👛', label: 'Accounts' },
  { id: 'transactions', icon: '🧾', label: 'Transactions' },
  { id: 'analytics', icon: '📊', label: 'Analytics' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
]
export const TabBar = ({ active }: { active: TabId }) => (
  <Box>
    {TABS.map((t) => (
      <Box key={t.id} marginRight={1}>
        {t.id === active ? (
          <Text backgroundColor={GREEN} color="black" bold>
            {` ${t.icon} ${t.label} `}
          </Text>
        ) : (
          <Text dimColor>{` ${t.icon} ${t.label} `}</Text>
        )}
      </Box>
    ))}
  </Box>
)
