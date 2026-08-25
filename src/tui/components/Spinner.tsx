import React from 'react'
import { Text } from 'ink'
import Spinner from 'ink-spinner'
import { GREEN } from '../theme.js'
export const Loading = ({ label }: { label: string }) => (
  <Text>
    <Text color={GREEN}>
      <Spinner type="dots" />
    </Text>{' '}
    {label}
  </Text>
)
