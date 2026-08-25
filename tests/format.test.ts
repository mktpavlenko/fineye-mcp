import { it, expect } from 'vitest'
import { money, accountEmoji, amountColor } from '../src/tui/format.js'
it('formats money with thousands + currency symbol', () => {
  expect(money(96393.99, 'UAH')).toBe('96 393.99 ₴')
  expect(money(2800, 'UAH')).toBe('2 800 ₴')
  expect(money(-150, 'UAH')).toBe('-150 ₴')
})
it('maps account type to emoji', () => {
  expect(accountEmoji('goal')).toBe('🎯')
  expect(accountEmoji('crypto')).toBe('₿')
  expect(accountEmoji('cash')).toBe('💵')
  expect(accountEmoji('weird')).toBe('💳')
})
it('colors by sign', () => {
  expect(amountColor(-5)).toBe('red')
  expect(amountColor(5)).toBe('green')
  expect(amountColor(0)).toBe('gray')
})
