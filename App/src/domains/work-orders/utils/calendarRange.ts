import type { CalendarPeriod } from '../../../integrations/microsoft-graph/calendar.types'

export function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function startOfWeek(date: Date): Date {
  const next = startOfDay(date)
  const weekday = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - weekday)
  return next
}

export function startOfMonth(date: Date): Date {
  const next = startOfDay(date)
  next.setDate(1)
  return next
}

export function endOfMonth(date: Date): Date {
  return addDays(startOfMonth(addDays(startOfMonth(date), 32)), 0)
}

/** Inclusive visual month grid: 6 weeks starting Monday. */
export function monthGridStart(date: Date): Date {
  return startOfWeek(startOfMonth(date))
}

export function getPeriodRange(period: CalendarPeriod, anchor: Date): { start: Date; end: Date } {
  if (period === 'day') {
    const start = startOfDay(anchor)
    return { start, end: addDays(start, 1) }
  }
  if (period === 'week') {
    const start = startOfWeek(anchor)
    return { start, end: addDays(start, 7) }
  }
  const start = startOfMonth(anchor)
  const end = addDays(startOfMonth(addDays(start, 32)), 0)
  return { start, end }
}

export function shiftAnchor(period: CalendarPeriod, anchor: Date, direction: -1 | 1): Date {
  const next = new Date(anchor)
  if (period === 'day') next.setDate(next.getDate() + direction)
  else if (period === 'week') next.setDate(next.getDate() + direction * 7)
  else next.setMonth(next.getMonth() + direction)
  return next
}

export function formatPeriodLabel(period: CalendarPeriod, anchor: Date): string {
  if (period === 'day') {
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(anchor)
  }
  if (period === 'week') {
    const start = startOfWeek(anchor)
    const end = addDays(start, 6)
    const formatter = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' })
    return `${formatter.format(start)} – ${formatter.format(end)}`
  }
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(anchor)
}

export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatDayShort(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(date)
}

export function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}
