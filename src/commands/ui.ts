import { Command } from 'commander'
export const uiCmd = new Command('ui').description('Interactive dashboard (arrow keys)').action(async () => {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error('fineye ui needs an interactive terminal (TTY). Use commands instead, e.g. `fineye accounts`, `fineye analytics`.')
    process.exitCode = 1
    return
  }
  const { render } = await import('ink')
  const React = await import('react')
  const { App } = await import('../tui/app.js')
  const app = render(React.createElement(App))
  await app.waitUntilExit()
})
