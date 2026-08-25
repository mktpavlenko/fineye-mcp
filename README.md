# fineye-mcp — your FinEye finances, for AI agents

> **Unofficial & independent.** This is a personal-use, community client for the [FinEye](https://fineye.app) app's API. It is **not affiliated with, endorsed by, or supported by FinEye**. It reaches only **your own** data with **your own** login. No warranty — use at your own risk. The embedded Supabase anon key is the app's public key (shipped in the FinEye client), not a secret.

An **MCP server** that gives an AI agent typed access to your FinEye personal finances — accounts,
transactions, budgets, categories, tags, holdings and spend analytics — with writes behind explicit
safety gates and deletes behind two more. The same code also ships a CLI and a terminal dashboard.

These are real financial records, not a sandbox. The design assumes that from the start: the
default mode cannot delete anything, read-only mode does not even _register_ the write tools, and
every destructive call is a preview until you confirm it.

## Quick start

```bash
npm install && npm run build
node dist/index.js login          # Google OAuth, token stored at ~/.config/fineye/session.json
npm link                          # optional: puts `fineye` on your PATH
```

Register it with Claude Code:

```bash
claude mcp add fineye -s user -- fineye mcp                          # read + write
claude mcp add fineye -s user -e FINEYE_DELETE=1 -- fineye mcp       # read + write + delete
claude mcp add fineye-ro -s user -e FINEYE_READONLY=1 -- fineye mcp  # read-only
```

Any other MCP client takes the same command:

```jsonc
{
  "mcpServers": {
    "fineye": {
      "command": "node",
      "args": ["/absolute/path/to/fineye-mcp/dist/index.js", "mcp"],
      "env": {},
    },
  },
}
```

## The tools

20 tools. Ten of them only read.

| Tool                                                | What it does                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `fineye_workspaces`                                 | which account the server is logged in as, and the active workspace              |
| `fineye_accounts`                                   | balances; `view='goals'` for savings goals, `view='holdings'` for crypto/stocks |
| `fineye_networth`                                   | net worth in the main currency, per-account breakdown, optional daily history   |
| `fineye_transactions`                               | rows with a derived `type` (expense/income/transfer) and `scheduled` flag       |
| `fineye_analytics`                                  | income/expense/net + spend breakdown by category, sub-category, tag or merchant |
| `fineye_budget`                                     | the period budget against actual spend; `action='history'` for past periods     |
| `fineye_categories` · `fineye_tags`                 | the hierarchies, for turning a name into an id                                  |
| `fineye_notifications`                              | the in-app inbox — where FinEye announces product changes                       |
| `fineye_export`                                     | transactions as CSV or JSON, inline                                             |
| `fineye_playbook`                                   | task guidance (see below)                                                       |
| `fineye_add` · `fineye_tx`                          | create a transaction; edit / tag / split / refund / copy / set recurring        |
| `fineye_category` · `fineye_tag` · `fineye_account` | create and edit; categories can be archived (reversible) instead of deleted     |
| `fineye_budget_set`                                 | set the total budget for a period                                               |
| `fineye_rules`                                      | auto-categorization rules — they apply to FUTURE transactions only              |
| `fineye_delete` · `fineye_bulk`                     | permanent deletion; bulk recategorize / tag / delete                            |

Anywhere a tool takes an `account`, `category`, `tag` or `parent`, a **name or an id** works.
Parameters literally named `id` are always raw ids.

## Modes and gates

The environment decides what the server can do at all:

| env                 | effect                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| _(none)_            | read + write. The delete tools are registered, but every delete is refused.      |
| `FINEYE_DELETE=1`   | deletes become possible — still only with `confirm: true` on each call.          |
| `FINEYE_READONLY=1` | write and destructive tools are **not registered at all**; 12 read tools remain. |

`FINEYE_DELETE` is set once, when the server is registered, and holds for the session — so it is a
capability, not a confirmation. That is why every destructive call _also_ needs `confirm: true`;
without it the tool returns a preview of what would go and changes nothing. `fineye_bulk` is a dry
run unless `apply: true`, and needs `apply` **and** `confirm` to delete.

Underneath the MCP layer the client enforces per-verb allow-lists (`WRITABLE_TABLES`,
`PATCHABLE_TABLES`, `DELETABLE_TABLES` in `src/client.ts`); any other table or HTTP verb is
rejected. Deletes accept a single `id=eq.<id>` filter — there is no mass-delete path — and bulk
deletes write a JSON backup to `/tmp` first. **Accounts and workspace settings can never be
deleted.** Scheduled installments are held back from bulk deletes unless you ask for them.

Errors carry a machine-readable `code` (`auth`, `forbidden`, `not_found`, `gate`, `invalid`,
`network`, `api`), so an agent can tell "no such transaction" from "the network is down" without
matching on message text. The CLI maps the same codes to exit statuses (3, 4, 5, 4, 2, 6, 1).

**Concurrency:** writes replace whole JSON fields rather than merging them, so avoid editing the
same record in the phone app at the same moment — last writer wins.

## Playbooks

Server `instructions` are sent on every connection, so they stay short. The deeper guidance — the
traps that actually cost someone a wrong number — is loaded only when a task calls for it:

- `monthly-review` — the order of calls that produces a correct monthly picture
- `safe-bulk-changes` — dry-run, verify the matched count, then apply
- `test-without-polluting` — the create → act → delete canary, and what cannot be undone
- `find-and-fix-categories` — rules fix the future, bulk fixes the past

They are served both as MCP resources (`fineye://playbooks/<id>`) and through the
`fineye_playbook` tool, because client support for resources is uneven. The data-model semantics
are shared with the CLI agent skill (`src/skill/semantics.ts`) so the two cannot drift apart.

## Remote access (HTTP)

For a client that cannot spawn a local process — a hosted chat UI, say — the server also speaks
Streamable HTTP:

```bash
export FINEYE_MCP_TOKEN=$(openssl rand -hex 24)
fineye mcp --http --port 8790          # binds 127.0.0.1; refuses to start without a token
```

Authenticate with a header, which keeps the secret out of URLs, browser history and proxy logs:

```
Authorization: Bearer $FINEYE_MCP_TOKEN
```

If your client has no header field, the token also works as the URL path
(`https://<host>/<token>`). A wrong credential gets a 404, never a 403 — a probe should not learn
that anything lives there.

The listener is plain HTTP on localhost **by design**: put a TLS front in front of it — Cloudflare
Tunnel, a Tailscale Funnel, a reverse proxy on a VPS, whatever you already run — and point the
client at `https://<your-host>/mcp`.

> Think before you do this. It puts a live endpoint to your real finances on the internet, guarded
> by one token. Prefer `FINEYE_READONLY=1` for anything left running unattended, keep the token out
> of screenshots, and rotate it by rewriting the file and restarting the server.

## CLI

The same operations, for humans and shell scripts.

```bash
fineye whoami
fineye accounts [--archived] [--json]
fineye networth [--history] [--json]
fineye transactions [--from <date> --to <date> --account <acc> --category <cat> --search <q>] [--json]
fineye analytics [--month YYYY-MM] [--all] [--leaf] [--by-tag] [--by-merchant --top <n>] [--json]
fineye budget [--month YYYY-MM] | fineye budget history [--limit <n>]
fineye export [--format csv|json] [--from --to] [--out <file>]

fineye add expense <amount> --account <acc> [--category --desc --date --fee]
fineye add transfer <amount> --from <acc> --to <acc> [--to-amount <n>]
fineye tx edit <id> [--desc --category --date --hold]
fineye bulk recategorize <filters> --set-category <cat> [--apply]
fineye rule add --merchant "<exact description>" --mcc <code> --category <cat>
```

Amounts are in the account's own currency (decimal major units, e.g. `42.50`). `add transfer`
writes the same magnitude to both legs, matching the app; pass `--to-amount` when the destination
actually received a different number — the CLI never converts at a rate of its own.

`fineye ui` opens a terminal dashboard: accounts and balances, net worth with a 30-day sparkline,
transactions for the selected account, and a spend-by-category chart.

For agents driving the CLI rather than the MCP server, `fineye skill --install` writes an agent
skill to `~/.claude/skills/use-fineye/SKILL.md`.

## How it works

FinEye is a Capacitor app on a Supabase backend. This client speaks to the same PostgREST tables
and RPCs the app does, authenticating as your own Google account over PKCE OAuth (email OTP as a
fallback). Row-level security means you only ever see your own rows.

The layering is deliberate:

```
src/domain/*      pure logic: valuation, analytics, transaction shapes, bulk selection
src/client.ts     the only thing that talks HTTP — and where the allow-lists live
src/mcp/*         the MCP surface: tools, resources, instructions, transports
src/commands/*    the CLI surface over the same domain
src/skill/*       data-model semantics, shared by the MCP instructions and the CLI skill
```

Both surfaces call the same domain functions, so the CLI and the MCP server cannot disagree about
what a transfer is or which rows count as spending.

A few facts about the data that the domain layer encodes, because getting them wrong produces
confident wrong answers: a transaction has no top-level amount (sum `movements[].sum`, negative for
expenses); each account has its own currency, so raw sums are not comparable; a two-leg movement is
always a transfer between your own accounts; and installment plans carry future legs flagged
`scheduled`, which analytics excludes from what you have actually spent.

## Development

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run format
```

The test suite spawns the built binary and speaks real MCP over stdio, so transport wiring is
covered rather than assumed.

## License

MIT — see [LICENSE](LICENSE).
