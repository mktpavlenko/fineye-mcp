import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { FineyeError } from '../../errors.js'

// No DI of a client here, unlike binance-mcp: this codebase's client is module functions, and its
// tests already mock them with vi.spyOn(client, …). A DI seam with one implementation would be
// abstraction for symmetry's sake.
export type ToolRegistrar = (server: McpServer) => void

// Compact on purpose: a model reads JSON fine without indentation, and pretty-printing roughly
// doubles the token cost of every list-shaped response (transactions, export, categories).
export function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

// Every tool goes through this. Without it a thrown FineyeError reaches the SDK as a bare message
// and the `code` — the whole point of typing them — is lost on the way to the model.
export async function run(fn: () => Promise<unknown>) {
  try {
    return jsonResult(await fn())
  } catch (e) {
    const error =
      e instanceof FineyeError
        ? { code: e.code, status: e.status, message: e.message }
        : { code: 'api' as const, message: e instanceof Error ? e.message : String(e) }
    return { ...jsonResult({ error }), isError: true }
  }
}

// Collects the domain's warnings (truncated scan, shifted financial month) so they ride back in
// the response instead of vanishing — an agent has no stderr to read.
export function collectWarnings() {
  const warnings: string[] = []
  return { warn: (m: string) => warnings.push(m), attach: <T>(data: T) => (warnings.length ? { ...data, warnings } : data) }
}

// Shared preamble for anything that can destroy data. `confirm:false` is a preview, never an
// error: the model needs something to show the user before asking for a yes.
export const CONFIRM_HINT = 'Without confirm:true this returns a preview and changes nothing.'
