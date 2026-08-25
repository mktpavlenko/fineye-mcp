import React from 'react'
import { Box, Text } from 'ink'
export const SpendBars = ({ rows }: { rows: { label: string; total: number }[] }) => {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.total)))
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>SPEND BY CATEGORY</Text>
      {rows.slice(0, 5).map((r) => (
        <Text key={r.label}>
          {r.label.slice(0, 14).padEnd(14)} <Text color="yellow">{'▇'.repeat(Math.round((Math.abs(r.total) / max) * 12))}</Text>{' '}
          {Math.round(r.total)}
        </Text>
      ))}
    </Box>
  )
}
