/** Graph getSchedule-aligned free/busy status codes. */
export type ScheduleAvailability =
  | 'free'
  | 'tentative'
  | 'busy'
  | 'oof'
  | 'workingElsewhere'
  | 'unknown'

export type CalendarPeriod = 'day' | 'week' | 'month'

export interface ScheduleTimeRange {
  start: Date
  end: Date
}

export interface ScheduleBlock {
  id: string
  start: string
  end: string
  status: ScheduleAvailability
  subject?: string | null
  location?: string | null
  source: 'graph' | 'work-order' | 'demo'
}

export interface EmployeeScheduleSnapshot {
  scheduleId: string
  displayName: string
  email: string | null
  timeZone: string
  rangeStart: string
  rangeEnd: string
  availabilityViewIntervalMinutes: number
  /** Compact availability string: 0 free, 1 tentative, 2 busy, 3 oof, 4 working elsewhere. */
  availabilityView: string
  blocks: ScheduleBlock[]
  workingHoursStart: number
  workingHoursEnd: number
  source: 'graph' | 'demo'
  sourceNote: string
  loadedAt: string
}

export interface LoadEmployeeScheduleInput {
  employeeId: string
  employeeName: string
  email?: string | null
  range: ScheduleTimeRange
  availabilityViewIntervalMinutes?: number
  /** Optional related work orders used to enrich demo / fallback busy blocks. */
  relatedBusyHints?: Array<{
    id: string
    label: string
    start: string
    end: string
  }>
}

export const SCHEDULE_STATUS_LABELS: Record<ScheduleAvailability, string> = {
  free: '空闲',
  tentative: '暂定',
  busy: '忙碌',
  oof: '不在办公室',
  workingElsewhere: '异地办公',
  unknown: '未知',
}

export function availabilityCode(status: ScheduleAvailability): string {
  switch (status) {
    case 'free': return '0'
    case 'tentative': return '1'
    case 'busy': return '2'
    case 'oof': return '3'
    case 'workingElsewhere': return '4'
    default: return '0'
  }
}

export function statusFromAvailabilityCode(code: string): ScheduleAvailability {
  switch (code) {
    case '1': return 'tentative'
    case '2': return 'busy'
    case '3': return 'oof'
    case '4': return 'workingElsewhere'
    default: return 'free'
  }
}
