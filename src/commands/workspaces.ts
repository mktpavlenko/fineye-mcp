import { Command } from 'commander'
import { requireSession } from './_shared.js'
import { listWorkspaces } from '../domain/workspaces.js'
import { setActiveWorkspace } from '../config.js'
import { output } from '../render.js'
export const workspacesCmd = new Command('workspaces')
  .description('List your workspaces')
  .option('--use <id>', 'set active workspace')
  .option('--json', 'json output')
  .action(async (o) => {
    if (o.use) {
      setActiveWorkspace(o.use)
      console.log(`Active workspace = ${o.use}`)
      return
    }
    const s = requireSession()
    const ws = await listWorkspaces(s.user.id)
    output(
      ws.map((w) => ({ id: w.workspace_id, name: w.workspaces.name, role: w.role, personal: w.workspaces.is_personal })),
      o.json,
      ['id', 'name', 'role', 'personal'],
    )
  })
