import { DATA_SEMANTICS } from './semantics.js'

export function buildSkillDoc(): string {
  return `---
name: use-fineye
description: >-
  Use the fineye CLI to access the user's FinEye personal-finance data — list
  accounts and balances, net worth, transactions (with filters), categories,
  tags, spend analytics, and to add or edit transactions and categories. Use
  when the user asks about their money, accounts, spending, balances, or budget.
metadata:
  version: 0.1.0
  requires:
    bins:
      - fineye
---

# Using fineye

\`fineye\` is a CLI for the FinEye personal-finance app. Use it to read the user's
accounts, transactions, categories and analytics, and to add/edit transactions
and categories.

## Running

\`\`\`bash
fineye <command> [options]
\`\`\`

Always pass \`--json\` when you need to parse output. Every read command supports it.

If your client supports MCP, prefer the MCP server (\`fineye mcp\`) over shelling out: it exposes
the same operations as typed tools, returns structured errors, and gates every delete behind an
explicit \`confirm\`. This skill is for driving the CLI directly.

## Auth

\`fineye\` talks to FinEye's backend with a stored session that auto-refreshes.
If a command fails with **"Not logged in"**, STOP and ask the user to run
\`fineye login\` themselves (it is interactive — opens a browser). Never attempt
to log in unattended.

## Commands

| Command | Kind | Description |
|---------|------|-------------|
| \`whoami\` | read | Current account |
| \`workspaces [--use <id>]\` | read | List workspaces / set active |
| \`accounts [--archived]\` | read | Accounts + balances |
| \`networth [--history]\` | read | Net worth in main currency |
| \`transactions [--from --to --account --category --search --limit --page --page-size]\` | read | List transactions |
| \`tx show <id>\` | read | One transaction |
| \`categories\` | read | Categories (with budgets) |
| \`tags\` | read | Tags |
| \`analytics [--month YYYY-MM] [--all] [--leaf] [--by-tag] [--by-merchant --top <n>]\` | read | Income/expense totals + spend by category (% of expense). \`--by-tag\` / \`--by-merchant\` break spending down by tag / merchant instead. Sub-category spend rolls up into the top-level category (\`--leaf\` for detail). All figures are converted to the workspace main currency. |
| \`goals\` | read | Savings goals with target/current/% |
| \`budget [--month YYYY-MM]\` | read | Monthly budget: total (+ carry-over) vs spent vs remaining |
| \`budget history [--limit <n>]\` | read | Every budgeted period with budget, carry-over, spent, remaining, % |
| \`budget set --amount <n> [--currency --planned-income --carry-over none\\|full\\|percent --carry-over-max-percent <n> --month]\` | write | Set the monthly total budget and the rollover policy |
| \`holdings [account]\` | read | Crypto/stocks holdings: qty × price, value, P&L vs avg buy price. Stocks have no price source — those rows show P&L as \`—\` (unknown, not zero) |
| \`export [--format csv\\|json --from --to --out <file>]\` | read | Export transactions (\`id,date,type,amount,currency,scheduled,legs,description,category\`). \`amount\` is RAW, in that row's \`currency\` — do not sum across currencies; \`scheduled=true\` rows are planned installments, not spend. |
| \`add expense <amount> --account <acc> [--category --desc --date]\` | write | Add an expense |
| \`add income <amount> --account <acc> [--category --desc --date]\` | write | Add income |
| \`add transfer <amount> --from <acc> --to <acc> [--to-amount --fee --desc]\` | write | Transfer between accounts (\`--to-amount\` when the currencies differ) |
| \`tx edit <id> [--desc --category --clear-category --date --hold\\|--unhold]\` | write | Edit a transaction |
| \`tx tag <id> --add\\|--remove <tag>\` | write | Add/remove a tag on a transaction |
| \`tx copy <id> [--date]\` | write | Duplicate a transaction into a new entry |
| \`cat add <title> [--type --icon --color --emoji]\` | write | Create a category |
| \`cat edit <id> [--title --type --icon --color --emoji --parent --clear-parent]\` | write | Edit a category |
| \`tag add <name>\` / \`tag edit <id> --name <name>\` | write | Create/edit a tag |
| \`tag delete <idOrName> --force\` | delete | PERMANENTLY delete a tag (needs \`FINEYE_DELETE=1\`) |
| \`account add <name> [--type --currency --balance --emoji --goal]\` | write | Create a manual account (\`--goal\` sets a goal target) |
| \`account edit <idOrName> [--name --emoji --goal --credit-limit --include-in-total\\|--exclude-from-total --include-in-analytics\\|--exclude-from-analytics --mark-savings\\|--unmark-savings --archive\\|--unarchive]\` | write | Edit account metadata / toggles |
| \`notifications\` | read | List in-app notifications |
| \`account holding <acc> --symbol <s> --qty <n> [--avg-price --stocks --remove]\` | write | Set/remove a crypto/stocks holding |
| \`account debt <acc> --currency <c> --amount <n> [--remove]\` | write | Set/remove a debt-ledger entry |
| \`tx refund <id> --amount <n>\` | write | Record a partial refund on an expense |
| \`tx split <id> --amount <n> --category <cat>\` | write | Split off part into a new categorized entry |
| \`tx recurring <id> --frequency <v>\\|--clear\` | write | Mark/unmark a transaction as recurring |
| \`rules\` | read | List auto-categorization rules (merchant -> category) |
| \`rule add --merchant <text> --category <cat> --mcc <code>\` | write | Teach: future transactions matching merchant+mcc get this category |
| \`rule edit <id> --category <cat>\` | write | Re-point an existing rule to another category |
| \`cat archive <id>\` / \`cat unarchive <id>\` | write | Archive/restore a category (reversible — preferred over delete) |
| \`cat delete <id> --force\` | delete | PERMANENTLY delete a category (needs \`FINEYE_DELETE=1\`) |
| \`tx delete <id> --force\` | delete | PERMANENTLY delete a transaction (needs \`FINEYE_DELETE=1\`) |
| \`bulk recategorize <txfilters> --set-category\\|--clear-category\` | write | Bulk re-categorize matching transactions (dry-run unless \`--apply\`) |
| \`bulk tag <txfilters> --add\\|--remove <tag>\` | write | Add/remove one tag across all matching transactions (dry-run unless \`--apply\`) |
| \`bulk delete-transactions <txfilters> [--include-scheduled]\` | delete | Bulk delete matching transactions; skips scheduled installments by default (dry-run; \`--apply\`+\`FINEYE_DELETE=1\`) |
| \`bulk archive-categories --ids\\|--parent\\|--match\` | write | Bulk archive categories (reversible; dry-run unless \`--apply\`) |
| \`bulk delete-categories --ids\\|--parent\\|--match\` | delete | Bulk delete categories (dry-run; \`--apply\`+\`FINEYE_DELETE=1\`) |

## Workspaces

Data is per-workspace. \`fineye workspaces\` lists them; \`--use <id>\` sets the active
one. Commands default to the user's personal workspace, so you usually don't
need to specify it.

## Output conventions

- Tables by default; add \`--json\` for machine-readable output (every read command supports it).
- Rows carry stable \`id\`s — use them for \`tx show\`, \`tx edit\`, etc. \`tx show <id>\`
  looks the id up directly (not just in recent rows), so any id resolves.
- Amounts are decimal numbers in the account's own currency (e.g. \`42.50\`).
- Accounts and categories can be referenced by **name or id** as command input.
- **Categories are hierarchical:** a sub-category has a \`parent\` (id) — \`categories
  --json\` also gives a convenience \`parentTitle\`. A transaction may be categorized on
  a sub-category. \`analytics\` rolls these up to the top-level category by default
  (use \`--leaf\` for the breakdown); a budget on a parent category counts spend on its
  sub-categories too.
- **In raw \`--json\` transactions, \`category\` and \`tags\` are IDs, and \`movements[].account\`
  is an object \`{id}\` holding an account id — not display names.** Resolve them via \`categories\`, \`tags\`,
  \`accounts\` (or use \`analytics\`, which already returns category **names**).
- A raw transaction has no top-level \`amount\` — sum \`movements[].sum\` (the
  \`transactions\` table and \`export\` add a derived \`amount\` for convenience; for a
  transfer that derived amount differs by surface, so prefer \`movements\`).
- Sign convention: expense \`sum\` is **negative**, income **positive**.
- Raw \`time\` is **unix-seconds as a string** (e.g. \`"1751331600"\`); the table and
  \`export\` give an ISO \`date\` instead. Command date inputs use \`YYYY-MM-DD\`.
- Each account has its **own currency**, so \`movements[].sum\` across different
  accounts can be in different currencies — do NOT sum them blindly. For
  currency-normalized figures use \`networth\` / \`analytics\` / \`budget\` (main currency;
  their JSON carries a \`currency\` field naming it).
- A transaction paid in a **foreign currency** keeps the original charge in
  \`movements[].invoice\` = \`{sum, instrument}\` while \`movements[].sum\` is the
  account-currency amount converted at the transaction date. The \`transactions\` table
  shows it as \`-224.7 (-4.99 USD)\`.
- \`merchant\` on a raw transaction is an object: \`{mcc, title, automation}\`. \`title\` is
  the bank's merchant name (the only merchant label available — use it, not a guess from
  the description); \`automation\` is present only on rows captured by the Apple Pay
  Wallet Shortcuts automation.

## Rules (auto-categorization)

\`rules\` lists FinEye's merchant->category overrides. \`rule add\` teaches a new one:
\`fineye rule add --merchant "Starbucks" --mcc 5814 --category "Кафе"\`. Get the \`--mcc\`
from a transaction's \`merchant.mcc\`. \`--mcc\` is required (a rule without it won't
match). Rules apply to **future incoming** transactions (they don't re-categorize
existing rows); their effect is confirmed only when a matching transaction next syncs.

\`--merchant\` must be the transaction \`description\` **exactly** — the app matches it
with \`equals\` on the raw string, so a lookalike character (typographic \` ’ \` vs \` ' \`)
means the rule never fires. Copy it from a real transaction rather than typing it; the
CLI warns when no transaction carries that exact description.

## Data model (shared with the MCP server)

${DATA_SEMANTICS}

## Transfers between currencies

\`add transfer\` writes the same magnitude to both legs — that is what the app itself does for a
manual cross-currency transfer. Pass \`--to-amount <n>\` when the destination account actually
received a different number. The CLI never converts at a rate of its own choosing.

## Bulk actions

\`bulk\` operates on many rows at once and is **dry-run by default**: it prints what
would be affected and changes nothing until you add \`--apply\`. Always show the user
the dry-run first and get confirmation before \`--apply\`. A filter/selection is
required (no select-all). \`bulk delete-transactions\` skips scheduled installment payments
unless you pass \`--include-scheduled\`. Deletes additionally need \`FINEYE_DELETE=1\` and write a
JSON backup of the affected rows to \`/tmp\` first. Prefer reversible ops
(\`bulk recategorize\`, \`bulk archive-categories\`) over bulk delete.

\`\`\`bash
fineye bulk recategorize --search Rozetka --set-category "Шопінг"     # dry-run
fineye bulk recategorize --search Rozetka --set-category "Шопінг" --apply
\`\`\`

## SAFETY (read carefully)

- Write commands (\`add\`, \`tx edit\`, \`cat add/edit\`, \`account edit\`, \`rule add/edit\`)
  **modify the user's real financial data.** Before running any write, confirm the
  exact change with the user. After it succeeds, echo back what you did including the
  returned \`id\`.
- \`account edit\` only changes name/emoji/archive — never balance, currency, type
  or bank linkage. **Accounts can never be deleted.**
- **Delete is destructive and triple-gated.** It only works on transactions and
  categories (never accounts/tags/rules), and ONLY when ALL of these hold:
  1. \`FINEYE_DELETE=1\` is set for the session (a SEPARATE opt-in from writes — if it
     is not set, every delete refuses, so you cannot delete unless the user enabled it);
  2. the command is given \`--force\`;
  3. \`FINEYE_READONLY\` is not set.
  **Always confirm a delete with the user first**, and prefer the reversible option:
  - Categories: use \`cat archive <id>\` (reversible) instead of \`cat delete\`. Hard-deleting
    a category that transactions use leaves them with an orphaned category id.
  - Transactions have no archive — \`tx delete <id> --force\` is permanent.
- When operating unattended (no human to confirm), set \`FINEYE_READONLY=1\` (blocks all
  writes) and leave \`FINEYE_DELETE\` unset.

## Examples

\`\`\`bash
fineye accounts --json
fineye networth
fineye transactions --from 2026-06-01 --to 2026-06-16 --json
fineye transactions --search Rozetka --limit 20
fineye analytics --month 2026-06 --json
fineye export --format csv --out ~/fineye.csv
# Write — only after the user confirms the amount/account:
fineye add expense 12.50 --account "Кеш" --desc "Coffee" --category "Шопінг"
\`\`\`
`
}
