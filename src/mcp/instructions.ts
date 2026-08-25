import { DATA_SEMANTICS } from '../skill/semantics.js'
import { isReadonly, isDeleteEnabled } from '../constants.js'

export function serverInstructions(): string {
  const mode = isReadonly() ? 'READ-ONLY' : isDeleteEnabled() ? 'read + write + DELETE' : 'read + write (no delete)'
  return `FinEye — the user's personal finances (accounts, transactions, budgets, holdings).
This server is running in **${mode}** mode.

These are real financial records, not a sandbox. Prefer reading; confirm with the user before any
write, and never invent a number you did not read from a tool.

## Working with it

- Anywhere a tool takes an \`account\`, \`category\`, \`tag\` or \`parent\`, a name or an id works —
  names resolve case-insensitively and an unknown one errors with \`not_found\`. Params literally
  named \`id\` (or \`ids\`) are raw ids from a previous read, never names. Ids are unambiguous when
  two entries share a name — \`fineye_categories\`, \`fineye_tags\` and \`fineye_accounts\` list them.
- A response may carry a \`warnings\` array. It means the answer may be incomplete or approximate —
  relay it rather than presenting the number as exact.
- An error comes back as \`{error: {code, status, message}}\`. \`code\` tells you what to do:
  \`auth\` → stop and ask the user to run \`fineye login\` in a terminal (never try to log in
  yourself, it needs a browser); \`gate\` → a safety gate refused, explain which; \`not_found\` →
  the id does not exist; \`network\` → transient, retrying is reasonable; \`invalid\` → fix the
  arguments; \`api\`/\`forbidden\` → report it, don't retry in a loop.

## Destructive actions

\`fineye_delete\` and the destructive \`fineye_bulk\` actions are **irreversible**. They need
\`confirm: true\`, and the server must additionally have been started with \`FINEYE_DELETE=1\` —
without that env the delete is refused no matter what you pass. Called without \`confirm\`, they
return a preview and change nothing: show that preview to the user and get a yes before repeating
the call with \`confirm: true\`. \`fineye_bulk\` is a dry run unless \`apply: true\`.

Accounts and workspace settings can never be deleted through this server.

Note: the user may also be editing the same records in the FinEye phone app. Writes replace whole
JSON fields, so avoid rewriting a record the user is editing right now.

${DATA_SEMANTICS}`
}
