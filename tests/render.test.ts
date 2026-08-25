import { it, expect } from 'vitest'
import { renderTable } from '../src/render.js'
it('renders rows as columns', () => {
  const out = renderTable([{ a: 1, b: 'x' }], ['a', 'b'])
  expect(out).toContain('a')
  expect(out).toContain('x')
})
