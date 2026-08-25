// The hard-won facts about FinEye's data model, worded without reference to any one interface.
// Both the CLI agent skill (skillDoc.ts) and the MCP server's instructions embed this verbatim —
// duplicating it would let two sets of instructions to the same model drift apart.
export const DATA_SEMANTICS = `### Shape of the data

- Rows carry stable \`id\`s. In a raw transaction, \`category\` and \`tags\` are **ids**, and
  \`movements[].account\` is an **object \`{id}\`** holding an account id — compare
  \`movements[].account.id\`, not the object. None of these are display names; resolve them
  against the category / tag / account lists.
- A raw transaction has no top-level amount — sum \`movements[].sum\`. Expense sums are
  **negative**, income **positive**.
- Raw \`time\` is **unix-seconds as a string** (e.g. \`"1751331600"\`). Date inputs are \`YYYY-MM-DD\`.
  A freshly bank-synced row can briefly carry \`time: null\` — such a row sorts first in listings
  and is invisible to any date-filtered query until the app fills the time in.
- Each account has its **own currency**, so \`movements[].sum\` from different accounts can be in
  different currencies — do NOT sum them blindly. Use the currency-normalized figures (net worth,
  analytics, budget); their output names the currency it used.
- A charge made in a foreign currency keeps the original in \`movements[].invoice\` =
  \`{sum, instrument}\`, while \`movements[].sum\` is the account-currency amount converted at the
  transaction date.
- \`merchant\` is an object \`{mcc, title, automation}\`. \`title\` is the bank's own merchant label —
  the only merchant name available, so prefer it over guessing from the description.
  \`automation\` appears only on rows captured by the Apple Pay Wallet Shortcuts automation.
- Categories are **hierarchical**: a sub-category has a \`parent\` id. Analytics rolls sub-categories
  up to their top-level parent by default.

### type vs category (this is the one that bites)

Every transaction carries a derived **\`type\`**: \`expense\` | \`income\` | \`transfer\`.

**When totalling spend, count only \`type: "expense"\`. Never gate on \`category\` alone.**

A \`transfer\` is a move between the user's **own** accounts (including goal and savings
contributions) — not spending, not income. In FinEye a 2-leg movement is *always* between owned
accounts. A payment to an external merchant is NOT a transfer: it is a single-leg \`expense\` with
the merchant on the row. A crypto or stock purchase is likewise a single-leg \`expense\` (holdings
are tracked separately on the account). So \`type === "transfer"\` already means "internal
own-account move" — don't second-guess it from the payment method.

Transfers carry \`category: null\` because that is their state in the database. The client is
faithful to the database and never rewrites a category on the way out; you gate on \`type\`, not on
\`category\`, so that a future row with a stray category on a transfer is still excluded.

### Scheduled (installment) payments

A movement with \`status: "scheduled"\` is a **future** planned payment — a bank installment
(розстрочка) that has not been executed. Its transaction carries a future \`time\`. These rows are
flagged with a derived top-level \`scheduled: true\`, and analytics and budget already exclude them
from actual spend. If you aggregate raw rows yourself, skip \`scheduled: true\` unless the user is
asking about upcoming payments.

### Auto-categorization rules

Rules map a transaction description + MCC to a category, and apply to **future incoming**
transactions only — adding one never re-categorizes existing rows, and its effect shows up when a
matching transaction next syncs. The description is matched with \`equals\` on the raw string, so a
lookalike character (a typographic \` ’ \` where the data has \` ' \`, or vice versa) means the rule
never fires. Copy the description from a real transaction rather than typing it.

### Unknown market prices

The backend publishes prices for crypto only. Stock holdings are valued at their average buy
price, so their profit/loss is **unknown, not zero** — those rows are marked \`estimated\` and
report a null P&L. Do not present them as break-even.`
