import { it, expect } from 'vitest'
import { toCsv, flattenForExport, EXPORT_COLS } from '../src/commands/export.js'
it('emits header + rows and quotes commas', () => {
  const csv = toCsv([{ a: 1, b: 'x,y' }], ['a', 'b'])
  expect(csv.split('\n')[0]).toBe('a,b')
  expect(csv).toContain('"x,y"')
})
it('is faithful to the DB: a backfilled transfer (category=null) stays type=transfer, category=null', () => {
  const [r] = flattenForExport([
    {
      id: '1',
      time: '1700000000',
      description: 'Переказ на заощадження',
      category: null, // transfers were backfilled to null at the source
      movements: [
        { sum: -50, account: { id: 'a' } },
        { sum: 50, account: { id: 'b' } },
      ],
    },
  ] as any)
  expect(r.type).toBe('transfer')
  expect(r.category).toBeNull()
  expect(r.amount).toBe(0)
  expect(r.legs).toBe(2)
})
it('does NOT rewrite category at the surface — passes through whatever the row holds', () => {
  // if a row ever carried a category, export returns it verbatim (no transfer special-casing);
  // `type` remains the canonical signal for analytics to exclude transfers.
  const [r] = flattenForExport([
    {
      id: 'x',
      time: '1700000000',
      description: 'Переказ на картку',
      category: 'cat-x',
      movements: [
        { sum: -220.2, account: { id: 'a' } },
        { sum: 5, account: { id: 'b' } },
      ],
    },
  ] as any)
  expect(r.type).toBe('transfer')
  expect(r.category).toBe('cat-x') // faithful passthrough, not nulled by the CLI
})
it('expense rows keep their category and type=expense', () => {
  const [r] = flattenForExport([
    { id: '2', time: '1700000000', description: 'Coffee', category: 'food', movements: [{ sum: -10, account: { id: 'a' } }] },
  ] as any)
  expect(r.type).toBe('expense')
  expect(r.category).toBe('food')
})
it('header carries the type column', () => {
  expect(EXPORT_COLS).toContain('type')
})
it('carries the account currency and the scheduled flag', () => {
  const rows = flattenForExport(
    [
      { id: '1', time: '1700000000', description: 'USD sub', category: 'c', movements: [{ sum: -10, account: { id: 'usd' } }] },
      {
        id: '2',
        time: '1700000000',
        description: 'installment',
        category: 'c',
        movements: [{ sum: -500, account: { id: 'uah' }, status: 'scheduled', scheduled_date: '2027-01-31' }],
      },
      { id: '3', time: '1700000000', description: 'unknown account', category: null, movements: [{ sum: -1, account: { id: 'gone' } }] },
    ] as any,
    new Map([
      ['usd', 'USD'],
      ['uah', 'UAH'],
    ]),
  )
  expect(rows[0].currency).toBe('USD')
  expect(rows[0].scheduled).toBe(false)
  expect(rows[1].currency).toBe('UAH')
  expect(rows[1].scheduled).toBe(true) // a planned installment is not actual spend
  expect(rows[2].currency).toBe('') // unknown account -> blank, never a wrong currency
  expect(EXPORT_COLS).toEqual(expect.arrayContaining(['currency', 'scheduled']))
})
