import { it, expect } from 'vitest'
import { parseDateToUnix, fmtUnixDate, parseNum } from '../src/util.js'
it('parseDateToUnix throws on invalid dates', () => {
  expect(parseDateToUnix('2026-06-01')).toBe(Math.floor(Date.parse('2026-06-01') / 1000))
  expect(() => parseDateToUnix('last tuesday')).toThrow(/invalid date/i)
})
it('fmtUnixDate never throws on bad time', () => {
  expect(fmtUnixDate('1779801098')).toMatch(/^\d{4}-\d\d-\d\d$/)
  expect(fmtUnixDate('NaN')).toBe('—')
  expect(fmtUnixDate('')).toBe('—')
})
it('parseNum throws on non-numeric', () => {
  expect(parseNum('20', 'limit')).toBe(20)
  expect(parseNum(undefined, 'limit')).toBeUndefined()
  expect(() => parseNum('abc', 'limit')).toThrow(/invalid limit/i)
})
