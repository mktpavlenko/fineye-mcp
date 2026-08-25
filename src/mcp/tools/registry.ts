import { registerRead } from './read.js'
import { registerWrite } from './write.js'
import { registerRules } from './rules.js'
import { registerDestructive } from './destructive.js'
import { registerPlaybooks } from './playbooks.js'
import { isReadonly } from '../../constants.js'
import type { ToolRegistrar } from './types.js'

// In read-only mode the write tools are not merely gated, they are NOT REGISTERED: a tool the
// model can see is a tool it will try, and a refusal it cannot avoid is wasted turns. `rules` is
// registered either way — it narrows itself to `list` when read-only (see rules.ts).
export function registrars(): ToolRegistrar[] {
  return isReadonly()
    ? [registerRead, registerRules, registerPlaybooks]
    : [registerRead, registerWrite, registerRules, registerDestructive, registerPlaybooks]
}
