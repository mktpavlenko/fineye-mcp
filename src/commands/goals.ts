import { Command } from 'commander'
import { requireWorkspace } from './_shared.js'
import { listAccounts } from '../domain/accounts.js'
import { goalProgress } from '../domain/goals.js'
import { money } from '../tui/format.js'
import { output } from '../render.js'
export const goalsCmd = new Command('goals')
  .description('Savings goals with progress')
  .option('--json')
  .action(async (o) => {
    const { workspaceId } = await requireWorkspace()
    const accts = await listAccounts(workspaceId)
    const goals = accts
      .filter((a) => a.type === 'goal')
      .map((a) => {
        const g = goalProgress(a)
        return { id: a.id, name: a.name, target: g.target, current: g.current, pct: Number(g.pct.toFixed(1)), currency: a.currency }
      })
    if (o.json) {
      console.log(JSON.stringify(goals, null, 2))
      return
    }
    output(
      goals.map((g) => ({
        name: g.name,
        progress: `${money(g.current, g.currency)} / ${money(g.target, g.currency)}`,
        pct: `${g.pct.toFixed(0)}%`,
      })),
      false,
      ['name', 'progress', 'pct'],
    )
  })
