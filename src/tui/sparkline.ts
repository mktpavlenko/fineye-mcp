const BLOCKS = '▁▂▃▄▅▆▇'
export function sparkline(values: number[]): string {
  if (!values.length) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values.map((v) => BLOCKS[Math.min(BLOCKS.length - 1, Math.floor(((v - min) / span) * (BLOCKS.length - 1)))]).join('')
}
