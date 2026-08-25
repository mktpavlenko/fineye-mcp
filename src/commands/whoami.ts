import { Command } from 'commander'
import { loadSession } from '../auth/tokenStore.js'
export const whoamiCmd = new Command('whoami')
  .description('Show current user')
  .option('--json')
  .action((o) => {
    const s = loadSession()
    if (o.json) {
      console.log(JSON.stringify(s ? { loggedIn: true, email: s.user.email, id: s.user.id } : { loggedIn: false }, null, 2))
      return
    }
    console.log(s ? `${s.user.email} (${s.user.id})` : 'Not logged in.')
  })
