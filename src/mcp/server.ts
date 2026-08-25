import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registrars } from './tools/registry.js'
import { serverInstructions } from './instructions.js'
import { isReadonly, isDeleteEnabled } from '../constants.js'
import type { ToolRegistrar } from './tools/types.js'

// Declared in serverInfo so a client that renders connectors has something better than a default
// glyph. Inlined as a data URI on purpose: it has to work in stdio mode too, where there is no
// host to fetch an icon from. Deliberately OUR OWN mark, not FinEye's: this is an unofficial
// client and must not wear the vendor's branding. Point FINEYE_MCP_ICON_URL elsewhere to override.
// Same mark as a raster, for the one consumer that cannot take SVG: a browser fetching
// /favicon.ico. Kept alongside the SVG so both come from one place.
export const ICON_PNG = Buffer.from(
  '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',
  'base64',
)

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f1a12"/><path d="M32 20c-11 0-19.5 8.2-22 12 2.5 3.8 11 12 22 12s19.5-8.2 22-12c-2.5-3.8-11-12-22-12z" fill="none" stroke="#27bf4b" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="32" r="7" fill="#27bf4b"/></svg>`

const ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMwZjFhMTIiLz48cGF0aCBkPSJNMzIgMjBjLTExIDAtMTkuNSA4LjItMjIgMTIgMi41IDMuOCAxMSAxMiAyMiAxMnMxOS41LTguMiAyMi0xMmMtMi41LTMuOC0xMS0xMi0yMi0xMnoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzI3YmY0YiIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iNyIgZmlsbD0iIzI3YmY0YiIvPjwvc3ZnPgo='

export function buildServer(regs: ToolRegistrar[] = registrars()): McpServer {
  const server = new McpServer(
    {
      name: 'fineye-mcp',
      version: '0.1.0',
      title: 'FinEye',
      description: "The user's personal finances: accounts, transactions, budgets and holdings.",
      websiteUrl: 'https://fineye.app',
      // A client that draws icons fetches them from a browser: a plain https URL works where a
      // data: URI is often blocked. Both are offered — the client picks what it can use.
      icons: [
        ...(process.env.FINEYE_MCP_ICON_URL ? [{ src: process.env.FINEYE_MCP_ICON_URL, mimeType: 'image/svg+xml', sizes: ['any'] }] : []),
        { src: ICON, mimeType: 'image/svg+xml', sizes: ['any'] },
      ],
    },
    { instructions: serverInstructions() },
  )
  for (const register of regs) register(server)
  return server
}

export async function startMcp(): Promise<void> {
  // stdout carries the MCP protocol: one stray log corrupts the stream, and the failure looks
  // like a broken client rather than a stray print. Redirect rather than rely on discipline.
  // eslint-disable-next-line no-console -- this IS the guard the rule exists for
  console.log = console.info = console.debug = console.dir = console.error
  const server = buildServer()
  await server.connect(new StdioServerTransport())
  console.error(`fineye-mcp ready (${isReadonly() ? 'read-only' : isDeleteEnabled() ? 'read+write+DELETE' : 'read+write'})`)
}
