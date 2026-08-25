import { it, expect } from 'vitest'
import { sparkline } from '../src/tui/sparkline.js'
it('maps ascending numbers to ascending blocks; empty -> empty', () => {
  expect(sparkline([])).toBe('')
  const s = sparkline([1, 2, 3, 4, 5, 6, 7, 8])
  expect(s.length).toBe(8)
  expect(s[0]).toBe('▁')
  expect(s[s.length - 1]).toBe('▇')
})
it('flat input renders the same lowest block', () => {
  expect(new Set(sparkline([3, 3, 3]).split(''))).toEqual(new Set(['▁']))
})
