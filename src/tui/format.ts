const SYM: Record<string, string> = { UAH: '₴', USD: '$', EUR: '€' }
export function money(n: number, currency: string): string {
  const neg = n < 0
  const abs = Math.abs(n)
  const isInt = abs % 1 === 0
  const [int, frac] = abs.toFixed(isInt ? 0 : 2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const num = frac ? `${grouped}.${frac}` : grouped
  return `${neg ? '-' : ''}${num} ${SYM[currency] ?? currency}`
}
const EMOJI: Record<string, string> = {
  goal: '🎯',
  crypto: '₿',
  cash: '💵',
  ccard: '💳',
  debt: '🤝',
  stocks: '📈',
  savings: '🏦',
}
export function accountEmoji(type: string): string {
  return EMOJI[type] ?? '💳'
}
export function amountColor(n: number): 'red' | 'green' | 'gray' {
  return n < 0 ? 'red' : n > 0 ? 'green' : 'gray'
}
