// Domain functions report problems that don't stop them (a truncated scan, an unpriced asset)
// through this instead of printing: the CLI sends them to stderr, and a programmatic caller —
// the MCP server — collects them into the response where an agent can actually read them.
export type Warn = (message: string) => void
export const warnStderr: Warn = (m) => console.error(`⚠ ${m}`)

// Row cap for "give me everything in this window" reads (analytics, budget, export, bulk).
// Getting exactly this many rows back means the answer is probably incomplete — see listTransactions.
export const SCAN_LIMIT = 100_000

// The app lets a workspace start its financial month on a day other than the 1st. The CLI totals
// calendar months: which of two calendar months a `period_key` names under a shifted window is not
// observable from the API, and coding that guess would produce a confidently wrong number. So it
// says when its figures will disagree with the app instead of pretending they won't.
export function warnFinancialMonth(start: number | null | undefined, warn: Warn = warnStderr): void {
  if (start != null && start !== 1)
    warn(
      `this workspace's financial month starts on day ${start}; the CLI totals a calendar month, so these figures will differ from the app`,
    )
}
