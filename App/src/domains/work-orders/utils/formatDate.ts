import type { DatePeriod } from '../../../shared/components'

export const localDateValue = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
)

export function formatDate(value: string | null | undefined, dateOnly = false) {
  if (!value) return '—'
  const date = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', dateOnly
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  ).format(date)
}

export function getDatePeriodBounds(period: DatePeriod, anchorDate: string): { start: number; end: number } | null {
  if (period === 'all' || !anchorDate) return null
  const start = new Date(`${anchorDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (period === 'month') start.setDate(1)
  const end = new Date(start)
  if (period === 'day') end.setDate(end.getDate() + 1)
  if (period === 'week') end.setDate(end.getDate() + 7)
  if (period === 'month') end.setMonth(end.getMonth() + 1)
  return { start: start.getTime(), end: end.getTime() }
}
