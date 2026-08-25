import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')
const describeBuilt = existsSync(CLI) ? describe : describe.skip

// The only test that speaks real MCP over a real stdio pipe to the built binary: it proves
// startMcp() connects, the protocol stream is not corrupted by stray stdout, and every tool
// arrives along with the server instructions. (tools/list needs no login — only handlers do.)
describeBuilt('fineye mcp (built, stdio)', () => {
  const connect = async (env: Record<string, string>) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI, 'mcp'],
      env: { ...process.env, FINEYE_CONFIG_DIR: '/tmp/fineye-integration-empty', FINEYE_READONLY: '', FINEYE_DELETE: '', ...env } as Record<
        string,
        string
      >,
    })
    const client = new Client({ name: 'stdio-test', version: '0.0.0' })
    await client.connect(transport)
    return client
  }

  it('serves all 20 tools and the mode line over stdio', async () => {
    const client = await connect({})
    try {
      const { tools } = await client.listTools()
      expect(tools.length).toBe(20)
      expect(client.getInstructions()).toContain('read + write (no delete)')
    } finally {
      await client.close()
    }
  }, 15000)

  it('read-only mode serves 12 tools over stdio', async () => {
    const client = await connect({ FINEYE_READONLY: '1' })
    try {
      const { tools } = await client.listTools()
      expect(tools.length).toBe(12)
      expect(tools.map((t) => t.name)).not.toContain('fineye_delete')
      expect(client.getInstructions()).toContain('READ-ONLY')
    } finally {
      await client.close()
    }
  }, 15000)
})
