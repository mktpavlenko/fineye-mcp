import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const run = promisify(execFile)
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')
// The only tests that exercise src/index.ts — argument wiring, the top-level catch and the exit
// codes a script would branch on. Everything else mocks the client and never reaches the entrypoint.
const describeBuilt = existsSync(CLI) ? describe : describe.skip

const exec = async (args: string[], env: Record<string, string> = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], {
      env: { ...process.env, FINEYE_CONFIG_DIR: '/tmp/fineye-integration-empty', ...env },
    })
    return { code: 0, stdout, stderr }
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string }
    return { code: err.code ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

describeBuilt('fineye CLI (built)', () => {
  it('--help lists the commands, including the MCP server', async () => {
    const r = await exec(['--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('transactions')
    expect(r.stdout).toContain('mcp')
  })

  it('exits 3 (auth) with no session, not a generic 1', async () => {
    const r = await exec(['accounts'])
    expect(r.code).toBe(3)
    expect(r.stderr).toContain('Not logged in')
  })

  it('exits 2 (invalid) on a bad argument, before touching the network', async () => {
    const r = await exec(['analytics', '--month', '2026-13'])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/Invalid month/)
  })

  it('an unknown command fails rather than silently doing nothing', async () => {
    const r = await exec(['definitely-not-a-command'])
    expect(r.code).not.toBe(0)
  })

  it('prints the agent skill to stdout', async () => {
    const r = await exec(['skill'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('name: use-fineye')
    expect(r.stdout).toContain('type vs category') // the shared semantics made it in
  })
})
