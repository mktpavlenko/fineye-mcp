import { it, expect } from 'vitest'
import { buildSkillDoc } from '../src/skill/skillDoc.js'
it('has front-matter, command table and load-bearing safety', () => {
  const d = buildSkillDoc()
  expect(d).toMatch(/^---\nname: use-fineye/)
  expect(d).toContain('metadata:')
  expect(d).toContain('| `accounts')
  expect(d).toContain('add expense')
  expect(d).toContain('FINEYE_DELETE') // delete is gated; the doc must say so
  expect(d).toContain('FINEYE_READONLY')
  expect(d.toLowerCase()).toContain('fineye login')
})
