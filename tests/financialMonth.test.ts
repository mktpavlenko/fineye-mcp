import { describe, it, expect, vi, afterEach } from 'vitest'
import { warnFinancialMonth } from '../src/warn.js'

// The CLI deliberately does NOT implement the shifted financial-month window: which of two
// calendar months a period_key names is not observable from the API, and coding that guess would
// produce a confidently wrong number. It warns instead.
describe('warnFinancialMonth', () => {
  afterEach(() => vi.restoreAllMocks())
  it('warns when the workspace shifts its month', () => {
    const seen: string[] = []
    warnFinancialMonth(25, (m) => seen.push(m))
    expect(seen[0]).toMatch(/financial month starts on day 25/)
  })
  it('stays silent for a day-1 workspace and when the field is absent', () => {
    const seen: string[] = []
    warnFinancialMonth(1, (m) => seen.push(m))
    warnFinancialMonth(null, (m) => seen.push(m))
    warnFinancialMonth(undefined, (m) => seen.push(m))
    expect(seen).toEqual([])
  })
  it('defaults to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnFinancialMonth(25)
    expect(spy).toHaveBeenCalled()
  })
})
