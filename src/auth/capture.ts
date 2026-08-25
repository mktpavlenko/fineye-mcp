import { spawn } from 'node:child_process'
export function extractCode(input: string): string | null {
  const t = input.trim()
  const m = t.match(/[?&]code=([^&\s]+)/)
  if (m) return decodeURIComponent(m[1])
  if (/^[A-Za-z0-9._~-]+$/.test(t) && t.length > 6) return t
  return null
}
export async function pollClipboardForCode(
  read: () => Promise<string>,
  opts: { intervalMs: number; timeoutMs: number; ignore?: string },
): Promise<string | null> {
  const end = Date.now() + opts.timeoutMs
  while (Date.now() < end) {
    const c = await read().catch(() => '')
    if (c && c !== opts.ignore) {
      const code = extractCode(c)
      if (code) return code
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs))
  }
  return null
}
export async function captureCode(deps: {
  readClipboard: () => Promise<string>
  promptCode: () => Promise<string>
  ignore?: string // clipboard contents already present at login start — never treat as the code
  timeoutMs?: number // injectable for tests
}): Promise<string> {
  const viaClip = pollClipboardForCode(deps.readClipboard, { intervalMs: 800, timeoutMs: deps.timeoutMs ?? 180000, ignore: deps.ignore })
  // A given-up manual branch must NOT settle the race (Promise.race takes the first
  // settled value, even null) — park it forever and let the clipboard timeout bound us.
  const never = new Promise<never>(() => {})
  // Manual prompt only makes sense at an interactive TTY; on non-TTY stdin readline can't
  // produce input (and question() may hang on EOF), so rely on clipboard/timeout instead.
  const viaPrompt: Promise<string | null> = process.stdin.isTTY
    ? (async () => {
        for (;;) {
          const raw = (await deps.promptCode()).trim()
          if (raw === '') return never // empty entry -> give up manual entry, keep waiting on the clipboard
          const code = extractCode(raw)
          if (code) return code // re-ask only on a non-empty typo so it doesn't abort the login
        }
      })()
    : never
  const code = await Promise.race([viaClip, viaPrompt])
  if (!code) throw new Error('No auth code captured (timed out). Re-run: fineye login')
  return code
}
export const realClipboard = async () =>
  new Promise<string>((res) => {
    const p = spawn('pbpaste')
    let o = ''
    p.stdout.on('data', (d: Buffer) => (o += d))
    p.on('close', () => res(o))
    p.on('error', () => res(''))
  })
