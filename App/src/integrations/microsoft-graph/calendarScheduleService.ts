import {
  availabilityCode,
  statusFromAvailabilityCode,
  type EmployeeScheduleSnapshot,
  type LoadEmployeeScheduleInput,
  type ScheduleAvailability,
  type ScheduleBlock,
} from './calendar.types'

const DEFAULT_INTERVAL = 30
const WORK_START_HOUR = 9
const WORK_END_HOUR = 18
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'China Standard Time'

function hashSeed(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

function toIso(date: Date): string {
  return date.toISOString()
}

function clampToRange(date: Date, start: Date, end: Date): Date {
  if (date < start) return new Date(start)
  if (date > end) return new Date(end)
  return date
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

function buildAvailabilityView(
  rangeStart: Date,
  rangeEnd: Date,
  intervalMinutes: number,
  blocks: ScheduleBlock[],
): string {
  const slotCount = Math.max(1, Math.ceil(minutesBetween(rangeStart, rangeEnd) / intervalMinutes))
  const chars: string[] = []
  for (let index = 0; index < slotCount; index += 1) {
    const slotStart = new Date(rangeStart.getTime() + index * intervalMinutes * 60000)
    const slotEnd = new Date(slotStart.getTime() + intervalMinutes * 60000)
    let status: ScheduleAvailability = 'free'
    for (const block of blocks) {
      const blockStart = new Date(block.start)
      const blockEnd = new Date(block.end)
      if (blockStart < slotEnd && blockEnd > slotStart) {
        if (block.status === 'oof') { status = 'oof'; break }
        if (block.status === 'busy') status = 'busy'
        else if (block.status === 'tentative' && status === 'free') status = 'tentative'
        else if (block.status === 'workingElsewhere' && status === 'free') status = 'workingElsewhere'
      }
    }
    chars.push(availabilityCode(status))
  }
  return chars.join('')
}

function createDemoBlocks(input: LoadEmployeeScheduleInput, rangeStart: Date, rangeEnd: Date): ScheduleBlock[] {
  const seed = hashSeed(input.employeeId || input.employeeName)
  const blocks: ScheduleBlock[] = []
  const cursor = new Date(rangeStart)
  cursor.setHours(0, 0, 0, 0)

  while (cursor < rangeEnd) {
    const day = cursor.getDay()
    const isWeekend = day === 0 || day === 6
    if (!isWeekend) {
      const dayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
      const daySeed = hashSeed(`${input.employeeId}:${dayKey}`)
      const morningBusy = daySeed % 3 !== 0
      const afternoonBusy = daySeed % 5 === 0 || daySeed % 4 === 0
      const lunchBusy = daySeed % 7 === 0

      if (morningBusy) {
        const start = new Date(cursor)
        start.setHours(WORK_START_HOUR + (daySeed % 2), (daySeed % 2) * 30, 0, 0)
        const end = new Date(start)
        end.setMinutes(end.getMinutes() + 60 + (daySeed % 3) * 30)
        blocks.push({
          id: `demo-am-${dayKey}`,
          start: toIso(clampToRange(start, rangeStart, rangeEnd)),
          end: toIso(clampToRange(end, rangeStart, rangeEnd)),
          status: daySeed % 11 === 0 ? 'tentative' : 'busy',
          subject: daySeed % 11 === 0 ? '待确认会议' : '项目同步会',
          location: 'Teams',
          source: 'demo',
        })
      }

      if (lunchBusy) {
        const start = new Date(cursor)
        start.setHours(12, 0, 0, 0)
        const end = new Date(cursor)
        end.setHours(13, 0, 0, 0)
        blocks.push({
          id: `demo-lunch-${dayKey}`,
          start: toIso(clampToRange(start, rangeStart, rangeEnd)),
          end: toIso(clampToRange(end, rangeStart, rangeEnd)),
          status: 'oof',
          subject: '午休 / 外出',
          source: 'demo',
        })
      }

      if (afternoonBusy) {
        const start = new Date(cursor)
        start.setHours(14 + (daySeed % 2), 0, 0, 0)
        const end = new Date(start)
        end.setMinutes(end.getMinutes() + 90)
        blocks.push({
          id: `demo-pm-${dayKey}`,
          start: toIso(clampToRange(start, rangeStart, rangeEnd)),
          end: toIso(clampToRange(end, rangeStart, rangeEnd)),
          status: seed % 9 === 0 ? 'workingElsewhere' : 'busy',
          subject: seed % 9 === 0 ? '现场支持' : '变更窗口值班',
          location: seed % 9 === 0 ? '客户现场' : '办公区',
          source: 'demo',
        })
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  for (const hint of input.relatedBusyHints ?? []) {
    const start = new Date(hint.start)
    const end = new Date(hint.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    if (end <= rangeStart || start >= rangeEnd) continue
    blocks.push({
      id: `wo-${hint.id}`,
      start: toIso(clampToRange(start, rangeStart, rangeEnd)),
      end: toIso(clampToRange(end, rangeStart, rangeEnd)),
      status: 'busy',
      subject: hint.label,
      source: 'work-order',
    })
  }

  return blocks
    .filter((block) => new Date(block.end) > new Date(block.start))
    .sort((left, right) => left.start.localeCompare(right.start))
}

/**
 * Loads free/busy for one employee.
 * Today uses a deterministic demo schedule (Graph connector not yet linked in power.config).
 * Replace `loadGraphSchedule` when Office 365 Outlook / custom Graph getSchedule is connected.
 */
async function loadGraphSchedule(_input: LoadEmployeeScheduleInput): Promise<EmployeeScheduleSnapshot | null> {
  // Placeholder for generated connector call, e.g.:
  // await Office365OutlookService.GetSchedule(...) or custom Graph connector.
  return null
}

export async function loadEmployeeSchedule(input: LoadEmployeeScheduleInput): Promise<EmployeeScheduleSnapshot> {
  const interval = input.availabilityViewIntervalMinutes ?? DEFAULT_INTERVAL
  const rangeStart = new Date(input.range.start)
  const rangeEnd = new Date(input.range.end)
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeEnd <= rangeStart) {
    throw new Error('日历查询时间范围无效。')
  }

  const graphSnapshot = await loadGraphSchedule(input)
  if (graphSnapshot) return graphSnapshot

  const blocks = createDemoBlocks(input, rangeStart, rangeEnd)
  const availabilityView = buildAvailabilityView(rangeStart, rangeEnd, interval, blocks)

  return {
    scheduleId: input.email?.trim() || input.employeeId,
    displayName: input.employeeName,
    email: input.email ?? null,
    timeZone: TIME_ZONE,
    rangeStart: toIso(rangeStart),
    rangeEnd: toIso(rangeEnd),
    availabilityViewIntervalMinutes: interval,
    availabilityView,
    blocks,
    workingHoursStart: WORK_START_HOUR,
    workingHoursEnd: WORK_END_HOUR,
    source: 'demo',
    sourceNote: '当前环境尚未连接 Microsoft Graph getSchedule；页面使用与人员/工单关联的演示忙闲数据。接入 Graph 后可替换为真实日历。',
    loadedAt: new Date().toISOString(),
  }
}

export function summarizeDayAvailability(
  availabilityView: string,
  dayIndex: number,
  slotsPerDay: number,
): ScheduleAvailability {
  const start = dayIndex * slotsPerDay
  const slice = availabilityView.slice(start, start + slotsPerDay)
  if (!slice) return 'free'
  if (slice.includes('3')) return 'oof'
  if (slice.includes('2')) return 'busy'
  if (slice.includes('1')) return 'tentative'
  if (slice.includes('4')) return 'workingElsewhere'
  return 'free'
}

export function slotsForStatus(
  availabilityView: string,
  status: ScheduleAvailability,
): number {
  const code = availabilityCode(status)
  return [...availabilityView].filter((char) => char === code).length
}

export function expandAvailabilitySlots(
  snapshot: EmployeeScheduleSnapshot,
): Array<{ start: Date; end: Date; status: ScheduleAvailability }> {
  const start = new Date(snapshot.rangeStart)
  const interval = snapshot.availabilityViewIntervalMinutes
  return [...snapshot.availabilityView].map((code, index) => {
    const slotStart = new Date(start.getTime() + index * interval * 60000)
    const slotEnd = new Date(slotStart.getTime() + interval * 60000)
    return { start: slotStart, end: slotEnd, status: statusFromAvailabilityCode(code) }
  })
}
