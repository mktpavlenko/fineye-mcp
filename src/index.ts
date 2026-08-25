#!/usr/bin/env node
import { Command } from 'commander'
import { FineyeError, EXIT_CODE } from './errors.js'
import { loginCmd } from './commands/login.js'
import { logoutCmd } from './commands/logout.js'
import { whoamiCmd } from './commands/whoami.js'
import { workspacesCmd } from './commands/workspaces.js'
import { accountsCmd, accountCmd } from './commands/accounts.js'
import { transactionsCmd } from './commands/transactions.js'
import { categoriesCmd, catCmd } from './commands/categories.js'
import { tagsCmd, tagCmd } from './commands/tags.js'
import { networthCmd } from './commands/networth.js'
import { addCmd } from './commands/add.js'
import { txCmd } from './commands/tx.js'
import { exportCmd } from './commands/export.js'
import { analyticsCmd } from './commands/analytics.js'
import { skillCmd } from './commands/skill.js'
import { uiCmd } from './commands/ui.js'
import { goalsCmd } from './commands/goals.js'
import { budgetCmd } from './commands/budget.js'
import { holdingsCmd } from './commands/holdings.js'
import { rulesCmd, ruleCmd } from './commands/rules.js'
import { bulkCmd } from './commands/bulk.js'
import { notificationsCmd } from './commands/notifications.js'
import { mcpCmd } from './commands/mcp.js'
const program = new Command()
program.name('fineye').description('CLI for FinEye personal finance').version('0.1.0')
for (const c of [
  loginCmd,
  logoutCmd,
  whoamiCmd,
  workspacesCmd,
  accountsCmd,
  accountCmd,
  transactionsCmd,
  categoriesCmd,
  catCmd,
  tagsCmd,
  networthCmd,
  addCmd,
  txCmd,
  exportCmd,
  analyticsCmd,
  skillCmd,
  uiCmd,
  goalsCmd,
  budgetCmd,
  holdingsCmd,
  tagCmd,
  rulesCmd,
  ruleCmd,
  bulkCmd,
  notificationsCmd,
  mcpCmd,
]) {
  program.addCommand(c)
}
program.parseAsync().catch((e: unknown) => {
  console.error(`✖ ${e instanceof Error ? e.message : String(e)}`)
  // Distinct codes so a script can branch without matching on message text.
  process.exit(e instanceof FineyeError ? EXIT_CODE[e.code] : 1)
})
