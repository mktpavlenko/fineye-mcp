import { it, expect } from 'vitest'
import { goalProgress } from '../src/domain/goals.js'
it('computes percent of target', () => {
  const r = goalProgress({ type: 'goal', balance: 96393.99, goal: 170000 } as any)
  expect(r.target).toBe(170000)
  expect(r.current).toBe(96393.99)
  expect(r.pct).toBeCloseTo(56.7, 1)
  expect(goalProgress({ type: 'goal', balance: 50, goal: 0 } as any).pct).toBe(0)
})
