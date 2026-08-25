import Table from 'cli-table3'
export function renderTable(rows: Record<string, unknown>[], cols: string[]): string {
  const t = new Table({ head: cols })
  for (const r of rows)
    t.push(
      cols.map((c) => {
        const v = r[c]
        return v == null ? '' : String(v)
      }),
    )
  return t.toString()
}
export function output(rows: unknown, asJson: boolean, cols?: string[]) {
  if (asJson || !cols) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  console.log(renderTable(rows as Record<string, unknown>[], cols))
}
