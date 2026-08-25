import { it, expect } from 'vitest'
import { defaultSkillPath } from '../src/commands/skill.js'
it('defaults to ~/.claude/skills/use-fineye/SKILL.md', () => {
  expect(defaultSkillPath()).toMatch(/\.claude\/skills\/use-fineye\/SKILL\.md$/)
})
