// Playbooks = the guidance that does NOT belong in the server instructions. Instructions are sent
// on every connection and must stay short; these are loaded only when the task calls for them
// (progressive disclosure). Each one encodes a trap that actually cost someone real data or a
// wrong answer — not generic advice.
export interface Playbook {
  id: string
  title: string
  summary: string
  body: string
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'monthly-review',
    title: 'Review a month of spending',
    summary: 'The order of tool calls that produces a correct monthly picture, and the numbers that must agree.',
    body: `## Reviewing a month

1. \`fineye_budget\` (month) — the headline: budget, spent, remaining, carry-over.
2. \`fineye_analytics\` (same month) — income / expense / net plus the category breakdown.
3. Only then \`fineye_transactions\` for the rows behind a number that looks wrong.

**The two must agree.** \`fineye_budget.spent\` and \`fineye_analytics.expense\` are computed from the
same filtered set. If they differ, something was filtered differently — say so instead of picking one.

**Never sum \`movements[].sum\` yourself to answer "how much did I spend".** Those are raw amounts in
each account's own currency, and the workspace holds UAH, USD and crypto accounts at once. Analytics
already restates everything in the main currency and names that currency in its output.

**What analytics deliberately excludes**, and why quoting a raw transaction total will disagree with it:
- **transfers** — moving money between your own accounts is not spending;
- **scheduled installments** (\`scheduled: true\`) — future legs of a payment plan that have not happened.

A month with a large installment plan will therefore show a smaller expense than a naive row sum.
That is correct, not a bug.

**Reporting:** relay any \`warnings\` array verbatim — it means the answer may be incomplete. Give the
currency with every figure. Do not round to "about 100k" when the tool returned 12345.67.`,
  },
  {
    id: 'safe-bulk-changes',
    title: 'Change many transactions without breaking anything',
    summary: 'Dry-run first, verify the matched count, then apply. Includes the traps that make a filter match more than you meant.',
    body: `## Bulk changes

\`fineye_bulk\` is a DRY RUN unless \`apply: true\`. Use that — it is the whole safety mechanism.

**The loop, every time:**
1. Call with the filter and no \`apply\`. Read \`matched\` and the sample rows.
2. Show the user the count and a few examples. Get a yes.
3. Repeat with \`apply: true\` (plus \`confirm: true\` for the destructive actions).

**Check \`matched\` against what you expect before applying.** A filter that was meant to hit 12 rows
and reports 400 is a wrong filter, not a busy month. \`search\` is a case-insensitive SUBSTRING of the
description, so "Market" also matches "Marketplace".

**Traps worth knowing:**
- Transfers cannot carry a spending category. \`recategorize\` silently skips them and reports
  \`skippedTransfers\` — a matched count larger than the changed count is usually this.
- \`delete-transactions\` holds back scheduled installments unless \`includeScheduled: true\`. Deleting
  those breaks a payment plan the app is tracking.
- Deletes are IRREVERSIBLE (no trash, no undo) and additionally require the server to have been
  started with \`FINEYE_DELETE=1\`. A JSON backup is written to /tmp first — quote its path.
- If a warning says the scan was truncated, the bulk action REFUSES to run rather than acting on a
  partial set. Narrow with from/to instead of retrying.

**Prefer reversible moves.** To retire a category, \`fineye_category action='archive'\` — deleting it
orphans its id on every transaction that used it, and those rows cannot be repaired afterwards.`,
  },
  {
    id: 'test-without-polluting',
    title: 'Try something out on real data safely',
    summary: 'These are real financial records. The create → act → delete canary pattern, and what cannot be undone.',
    body: `## Trying things out

This workspace holds real money records. There is no sandbox and no undo.

**Canary pattern** — when you must verify that a write behaves as expected:
1. Create ONE marked row: \`fineye_add\` with a description carrying an obvious marker, a tiny amount,
   on an account with a zero balance.
2. Do the thing you needed to test on THAT row.
3. Delete it (needs \`FINEYE_DELETE=1\` and \`confirm: true\`).
4. Verify the space is clean: search the marker, and check \`fineye_networth\` matches its earlier value.

**Never test on a row you did not create.**

**Things that CANNOT be cleaned up — do not use them as guinea pigs:**
- **Accounts** — cannot be deleted through this server at all.
- **Budget periods** — cannot be deleted. \`fineye_budget_set\` OVERWRITES. Read the period with
  \`fineye_budget\` FIRST and keep the \`previous\` value it returns, so you can restore it.
- **Rules** — can be added and edited but not removed here.
- A deleted transaction still leaves a permanent tombstone in the app's sync log.

**The user may be editing the same records in the phone app right now.** Writes replace whole JSON
fields, so re-read a record before rewriting it rather than acting on a value you read minutes ago.`,
  },
  {
    id: 'find-and-fix-categories',
    title: 'Investigate and fix categorization',
    summary: 'Why a category total looks wrong, and the difference between fixing history and fixing the future.',
    body: `## Categorization

**Two different jobs, two different tools — agents confuse them constantly:**
- Fixing rows that ALREADY exist → \`fineye_bulk action='recategorize'\`.
- Fixing rows that arrive LATER → \`fineye_rules action='add'\`.

A rule NEVER touches existing transactions. If the user says "put Market under Groceries", they almost
always want both: the rule for the future and a bulk pass over history.

**Rules match the raw description with \`equals\` — exactly.** Copy the string from a real transaction
rather than typing it: the data contains lookalike characters (a typographic apostrophe in
\`McDonald’s\`, not the ASCII one). The tool warns when no transaction matches the string exactly;
that warning means the rule will never fire. Do not ignore it.

\`fineye_rules action='edit'\` changes only the assigned category. Merchant and MCC are fixed at
creation — to change them, add a new rule.

**When a category total looks wrong:**
1. \`fineye_analytics groupBy='leafCategory'\` — the default rolls sub-categories into their parent,
   which hides where the money actually sits.
2. \`fineye_transactions\` with that \`category\` to see the rows.
3. Check for transfers wearing a spending category (historically a real source of phantom spend) and
   for split rows, which carry part of a parent transaction's amount.

A rule pointing at a deleted category comes back marked \`orphaned: true\` — it can never fire again.`,
  },
]

export function playbookIndex(): string {
  return PLAYBOOKS.map((p) => `- \`${p.id}\` — ${p.title}: ${p.summary}`).join('\n')
}
