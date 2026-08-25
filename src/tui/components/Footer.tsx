import React from 'react'
import { Text } from 'ink'
export const Footer = ({ message }: { message?: string }) => (
  <Text dimColor>{message ?? '↑↓ select · ←→/tab pane · a add · r refresh · q quit'}</Text>
)
