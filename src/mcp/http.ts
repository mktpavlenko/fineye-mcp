import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildServer, ICON_SVG, ICON_PNG } from './server.js'
import { isReadonly, isDeleteEnabled } from '../constants.js'
import { FineyeError } from '../errors.js'

// One shared secret, two ways to present it. A header is the better one — it stays out of URLs,
// browser history, proxy logs and screenshots — so it is what the README recommends. The URL path
// is kept because not every remote MCP client offers a header field, and a client that cannot
// authenticate at all is worse than one that authenticates visibly. Either way the token is a
// password: required, long, compared in constant time, and never written to the log.
const MIN_TOKEN = 24

export function requireToken(): string {
  const t = (process.env.FINEYE_MCP_TOKEN ?? '').trim()
  if (t.length < MIN_TOKEN)
    throw new FineyeError(
      `HTTP mode needs FINEYE_MCP_TOKEN with at least ${MIN_TOKEN} characters — it is the only thing standing between the internet and your finances (generate one with \`openssl rand -hex 24\`)`,
      'gate',
    )
  return t
}

// Length-independent equality: a plain === on a secret leaks its prefix through response timing.
function sameSecret(got: string, want: string): boolean {
  const a = Buffer.from(got)
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

// The whole access check, hence its own test. `authorization` wins when present; otherwise the
// path has to be the token. Presenting a WRONG header never falls through to the path — that
// would turn a typo in the header into a silent downgrade to the weaker credential.
export function isAuthorized(req: { url?: string; headers?: Record<string, unknown> }, token: string): boolean {
  const header = req.headers?.['authorization']
  if (typeof header === 'string' && header.length) {
    const m = /^Bearer\s+(.+)$/i.exec(header.trim())
    return !!m && sameSecret(m[1].trim(), token)
  }
  const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '') || '/'
  return sameSecret(path, `/${token}`)
}

export async function startHttpMcp(port: number, host = '127.0.0.1'): Promise<void> {
  const token = requireToken() // throws before the port opens if the token is missing
  const mode = isReadonly() ? 'read-only' : isDeleteEnabled() ? 'read+write+DELETE' : 'read+write'

  // Off by default. Turned on while working out what a remote client actually fetches (icons,
  // favicons, discovery probes) — guessing at that from the outside is how you fix the wrong thing.
  const trace = !!process.env.FINEYE_MCP_TRACE
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    // The secret never reaches the log, even when tracing.
    if (trace) console.error(`> ${req.method} ${(req.url ?? '').replace(token, '<token>')}  ua=${req.headers['user-agent'] ?? '-'}`)
    // The one unauthenticated route. A client that renders connector icons fetches them from the
    // browser, which will not send our secret and often refuses a data: URI outright — so the icon
    // needs a plain URL. It serves a static picture and nothing else; no data reaches this path.
    if (req.method === 'GET' && (req.url ?? '').split('?')[0] === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).end(ICON_PNG)
      return
    }
    if (req.method === 'GET' && (req.url ?? '').split('?')[0] === '/icon.svg') {
      res
        .writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        })
        .end(ICON_SVG)
      return
    }
    // A wrong secret is a 404, not a 403: a probe should not learn that anything lives here.
    if (!isAuthorized(req as { url?: string; headers: Record<string, unknown> }, token)) {
      res.writeHead(404).end('not found')
      return
    }
    if (req.method !== 'POST') {
      // Stateless: no standalone SSE stream to open, no session to delete.
      res.writeHead(405, { Allow: 'POST' }).end('method not allowed')
      return
    }
    // One server + transport per request. Stateless is the honest model here — there is a single
    // user, calls are short, and a session map would just be state to leak or expire.
    const server = buildServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
  }

  const http = createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('fineye-mcp http:', e instanceof Error ? e.message : e)
      if (!res.headersSent) res.writeHead(500).end('internal error')
    })
  })

  await new Promise<void>((resolve) => http.listen(port, host, resolve))
  console.error(`fineye-mcp listening on http://${host}:${port} (${mode})`)
  console.error('Authenticate with `Authorization: Bearer $FINEYE_MCP_TOKEN`, or use /$FINEYE_MCP_TOKEN as the path.')
  console.error('This port is plain HTTP and bound locally — put a TLS front (Tailscale Funnel, cloudflared) in front of it.')
}
