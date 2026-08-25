import { z } from 'zod'
import { PLAYBOOKS, playbookIndex } from '../../skill/playbooks.js'
import { FineyeError } from '../../errors.js'
import { run, type ToolRegistrar } from './types.js'

// Two delivery paths for ONE body of text. Resources are the protocol's own answer to "ship a
// document", but client support for them is uneven — a tool is reachable everywhere. Both read
// from src/skill/playbooks.ts, so they cannot drift.
export const registerPlaybooks: ToolRegistrar = (server) => {
  for (const p of PLAYBOOKS)
    server.registerResource(
      p.id,
      `fineye://playbooks/${p.id}`,
      { title: p.title, description: p.summary, mimeType: 'text/markdown' },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: p.body }] }),
    )

  server.registerTool(
    'fineye_playbook',
    {
      title: 'How to do it properly',
      description: `Task-specific guidance for working with this data — read the relevant one BEFORE a multi-step job, not after it goes wrong. Call with no topic for the list.\n\n${playbookIndex()}`,
      inputSchema: { topic: z.string().optional().describe('playbook id; omit to list them') },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    (a) =>
      run(async () => {
        if (!a.topic) return { playbooks: PLAYBOOKS.map((p) => ({ id: p.id, title: p.title, summary: p.summary })) }
        const hit = PLAYBOOKS.find((p) => p.id === a.topic)
        if (!hit) throw new FineyeError(`No such playbook: ${a.topic} (have: ${PLAYBOOKS.map((p) => p.id).join(', ')})`, 'not_found')
        return { id: hit.id, title: hit.title, playbook: hit.body }
      }),
  )
}
