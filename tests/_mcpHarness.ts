// Calls a tool the way the SDK would, without standing up a stdio server — same idea as
// binance-mcp's _toolHarness, adapted to registerTool's (name, config, cb) signature.
type Result = { content: { type: string; text: string }[]; isError?: boolean }
type Handler = (args: any) => Promise<Result>

export function fakeServer() {
  const tools: Record<string, Handler> = {}
  const configs: Record<string, any> = {}
  const resources: Record<string, any> = {}
  const server: any = {
    registerTool: (name: string, config: any, cb: Handler) => {
      if (tools[name]) throw new Error(`duplicate tool name: ${name}`)
      tools[name] = cb
      configs[name] = config
    },
    registerResource: (name: string, uri: string, config: any, cb: unknown) => {
      if (resources[name]) throw new Error(`duplicate resource name: ${name}`)
      resources[name] = { uri, config, cb }
    },
  }
  return { server, tools, configs, resources }
}
export const json = (r: Result) => JSON.parse(r.content[0].text)
export const WS = { session: { user: { id: 'u1', email: 'e@x' } }, workspaceId: 'w1' } as any
