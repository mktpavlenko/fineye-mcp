import { Command } from 'commander'
import { runLogin } from '../auth/login.js'
import { realClipboard } from '../auth/capture.js'
import { sendOtp, verifyOtp } from '../auth/otp.js'
import { saveSession } from '../auth/tokenStore.js'
import { createInterface } from 'node:readline/promises'
async function ask(q: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await rl.question(q)
  rl.close()
  return a.trim()
}
export const loginCmd = new Command('login')
  .description('Log in via Google (auto-capture) or --otp <email>')
  .option('--otp <email>', 'use email one-time-code instead of Google')
  .action(async (opts) => {
    if (opts.otp) {
      await sendOtp(opts.otp)
      const code = await ask(`Code sent to ${opts.otp}. Enter it: `)
      const s = await verifyOtp(opts.otp, code)
      saveSession(s)
      console.log(`Logged in as ${s.user.email}`)
      process.exit(0)
    }
    console.log('Opening browser… after login, just COPY the redirect URL (Cmd+C) — I will catch it.')
    const s = await runLogin({ readClipboard: realClipboard, promptCode: () => ask('…or paste the code/URL here: ') })
    console.log(`Logged in as ${s.user.email}`)
    process.exit(0) // a manual-prompt readline may still be open if the clipboard won — exit cleanly
  })
