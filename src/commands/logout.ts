import { Command } from 'commander'
import { clearSession } from '../auth/tokenStore.js'
export const logoutCmd = new Command('logout').description('Clear stored session').action(() => {
  clearSession()
  console.log('Logged out.')
})
