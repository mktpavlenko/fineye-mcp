import { Command } from 'commander'
import { parseNum } from '../util.js'
export const mcpCmd = new Command('mcp')
  .description('Run the MCP server (stdio by default; --http for a remote client such as claude.ai)')
  .option('--http', 'serve over HTTP instead of stdio — needs FINEYE_MCP_TOKEN')
  .option('--port <n>', 'port for --http', '8790')
  .option('--host <addr>', 'bind address for --http', '127.0.0.1')
  .action(async (o) => {
    // Imported lazily so an ordinary CLI invocation never pays to load the MCP SDK.
    if (o.http) {
      const { startHttpMcp } = await import('../mcp/http.js')
      await startHttpMcp(parseNum(o.port, '--port')!, o.host)
      return
    }
    const { startMcp } = await import('../mcp/server.js')
    await startMcp()
  })
