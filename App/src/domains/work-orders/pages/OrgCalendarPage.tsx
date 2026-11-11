import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SearchInput, LoadingState, EmptyState, ErrorState } from '../../../shared/components'
import { useOverlayFocus } from '../../../shared/components/overlays/useOverlayFocus'
import {
  SCHEDULE_STATUS_LABELS,
  type CalendarPeriod,
  type EmployeeScheduleSnapshot,
  type ScheduleAvailability,
  type ScheduleBlock,
} from '../../../integrations/microsoft-graph/calendar.types'
import {
  loadEmployeeSchedule,
  slotsForStatus,
} from '../../../integrations/microsoft-graph/calendarScheduleService'
import type { EmployeeOption, WorkOrder } from '../types/workOrder.types'
import {
  addDays,
  formatClock,
  formatDayShort,
  formatPeriodLabel,
  getPeriodRange,
  monthGridStart,
  sameDay,
  shiftAnchor,
  startOfDay,
  startOfWeek,
} from '../utils/calendarRange'
import { Avatar } from '../components/WorkOrderBadges'
import './OrgCalendarPage.css'

export interface OrgCalendarPageProps {
  employees: EmployeeOption[]
  workOrders: WorkOrder[]
  loadingEmployees?: boolean
}

type AvailabilityFilter = 'all' | 'available' | 'unavailable'

const PERIOD_OPTIONS: Array<{ id: CalendarPeriod; label: string }> = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
]

const STATUS_LEGEND: ScheduleAvailability[] = ['busy', 'tentative', 'oof', 'workingElsewhere', 'free']

function statusClass(status: ScheduleAvailability): string {
  return `org-cal-status-${status}`
}

function blocksOverlappingDay(blocks: ScheduleBlock[], day: Date): ScheduleBlock[] {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  return blocks.filter((block) => {
    const start = new Date(block.start)
    const end = new Date(block.end)
    return start < dayEnd && end > dayStart
  })
}

function dominantStatus(blocks: ScheduleBlock[]): ScheduleAvailability {
  if (blocks.some((block) => block.status === 'oof')) return 'oof'
  if (blocks.some((block) => block.status === 'busy')) return 'busy'
  if (blocks.some((block) => block.status === 'tentative')) return 'tentative'
  if (blocks.some((block) => block.status === 'workingElsewhere')) return 'workingElsewhere'
  return 'free'
}

function blockDurationLabel(start: Date, end: Date): string {
  const minutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}

function sourceLabel(source: ScheduleBlock['source']): string {
  if (source === 'work-order') return '关联工单'
  if (source === 'graph') return 'Graph'
  return '演示'
}

export function OrgCalendarPage({ employees, workOrders, loadingEmployees = false }: OrgCalendarPageProps) {
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive).sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'zh-CN')),
    [employees],
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [period, setPeriod] = useState<CalendarPeriod>('week')
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()))
  const [schedule, setSchedule] = useState<EmployeeScheduleSnapshot | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  useEffect(() => {
    if (selectedEmployeeId && activeEmployees.some((employee) => employee.id === selectedEmployeeId)) return
    setSelectedEmployeeId(activeEmployees[0]?.id ?? null)
  }, [activeEmployees, selectedEmployeeId])

  const selectedEmployee = activeEmployees.find((employee) => employee.id === selectedEmployeeId) ?? null
  const range = useMemo(() => getPeriodRange(period, anchorDate), [period, anchorDate])
  const assignedCount = useMemo(
    () => (selectedEmployee ? workOrders.filter((order) => order.assignedToId === selectedEmployee.id).length : 0),
    [selectedEmployee, workOrders],
  )

  useEffect(() => {
    if (!selectedEmployee) {
      setSchedule(null)
      setScheduleError(null)
      return undefined
    }
    let active = true
    setLoadingSchedule(true)
    setScheduleError(null)
    const relatedBusyHints = workOrders
      .filter((order) => order.assignedToId === selectedEmployee.id)
      .map((order) => {
        const start = order.createTime || new Date().toISOString()
        const end = order.expectedCompletionTime
          || order.resolvedAt
          || new Date(new Date(start).getTime() + 2 * 60 * 60000).toISOString()
        return {
          id: order.id,
          label: `${order.workOrderNumber || '工单'} · ${order.workOrderName}`,
          start,
          end,
        }
      })

    void loadEmployeeSchedule({
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.employeeName,
      email: selectedEmployee.email,
      range,
      availabilityViewIntervalMinutes: period === 'month' ? 60 : 30,
      relatedBusyHints,
    })
      .then((snapshot) => {
        if (!active) return
        setSchedule(snapshot)
      })
      .catch((error: unknown) => {
        if (!active) return
        setSchedule(null)
        setScheduleError(error instanceof Error ? error.message : '读取组织日历失败。')
      })
      .finally(() => {
        if (active) setLoadingSchedule(false)
      })

    return () => { active = false }
  }, [selectedEmployee, range, period, workOrders])

  const hourRows = useMemo(() => {
    if (!schedule) return [] as number[]
    const hours: number[] = []
    for (let hour = schedule.workingHoursStart; hour < schedule.workingHoursEnd; hour += 1) hours.push(hour)
    return hours
  }, [schedule])

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate)
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }, [anchorDate])

  const monthDays = useMemo(() => {
    const start = monthGridStart(anchorDate)
    return Array.from({ length: 42 }, (_, index) => addDays(start, index))
  }, [anchorDate])

  const summary = useMemo(() => {
    if (!schedule) return null
    return {
      busy: slotsForStatus(schedule.availabilityView, 'busy'),
      tentative: slotsForStatus(schedule.availabilityView, 'tentative'),
      oof: slotsForStatus(schedule.availabilityView, 'oof'),
      free: slotsForStatus(schedule.availabilityView, 'free'),
      workingElsewhere: slotsForStatus(schedule.availabilityView, 'workingElsewhere'),
    }
  }, [schedule])

  const openPicker = () => {
    setPickerQuery('')
    setAvailabilityFilter('all')
    setPickerOpen(true)
  }

  return <section className="org-cal-page" aria-labelledby="org-cal-title">
    <header className="org-cal-hero">
      <div className="org-cal-hero-copy">
        <span className="org-cal-eyebrow">MICROSOFT GRAPH · GETSCHEDULE</span>
        <h2 id="org-cal-title">组织日历</h2>
        <p>查看当前工程师的日 / 周 / 月忙闲；点击右侧切换人员，便于派单前确认可约时段。</p>
      </div>

      {loadingEmployees && <LoadingState label="正在读取员工目录…" size="small" />}
      {!loadingEmployees && !selectedEmployee && <EmptyState title="暂无可用人员" description="请先在资源目录维护启用中的员工。" />}
      {selectedEmployee && <div className="org-cal-person-card">
        <div className="org-cal-person-main">
          <Avatar name={selectedEmployee.employeeName} />
          <div className="org-cal-person-meta">
            <div className="org-cal-person-title-row">
              <strong>{selectedEmployee.employeeName}</strong>
              <span className={selectedEmployee.isAvailableForOrder ? 'org-cal-pill is-available' : 'org-cal-pill is-busy'}>
                {selectedEmployee.isAvailableForOrder ? '可接单' : '不可接单'}
              </span>
              {schedule && <span className="org-cal-pill is-source" title={schedule.sourceNote}>
                {schedule.source === 'graph' ? 'Graph 实时' : '演示数据'}
              </span>}
            </div>
            <p>{selectedEmployee.department || '未设置部门'}{selectedEmployee.email ? ` · ${selectedEmployee.email}` : ' · 暂无邮箱'}</p>
            <small>当前名下工单 {assignedCount} 张 · 工作时段 {schedule ? `${String(schedule.workingHoursStart).padStart(2, '0')}:00–${String(schedule.workingHoursEnd).padStart(2, '0')}:00` : '09:00–18:00'}</small>
          </div>
        </div>
        <button className="button button-primary org-cal-switch-btn" type="button" onClick={openPicker}>
          切换人员
        </button>
      </div>}
    </header>

    {selectedEmployee && <div className="org-cal-board">
      <div className="org-cal-board-toolbar">
        <div className="org-cal-period-controls" role="group" aria-label="日历维度">
          {PERIOD_OPTIONS.map((option) => <button
            key={option.id}
            type="button"
            className={period === option.id ? 'org-cal-period-active' : undefined}
            aria-pressed={period === option.id}
            onClick={() => setPeriod(option.id)}
          >{option.label}</button>)}
        </div>
        <div className="org-cal-nav-cluster">
          <button type="button" className="button button-quiet" onClick={() => setAnchorDate((current) => shiftAnchor(period, current, -1))} aria-label="上一时段">‹</button>
          <button type="button" className="button button-quiet" onClick={() => setAnchorDate(startOfDay(new Date()))}>今天</button>
          <button type="button" className="button button-quiet" onClick={() => setAnchorDate((current) => shiftAnchor(period, current, 1))} aria-label="下一时段">›</button>
          <strong className="org-cal-period-label">{formatPeriodLabel(period, anchorDate)}</strong>
        </div>
        {summary && <div className="org-cal-legend" aria-label="忙闲图例">
          {STATUS_LEGEND.map((status) => <span key={status} className={statusClass(status)}>
            <i />{SCHEDULE_STATUS_LABELS[status]} <b>{summary[status]}</b>
          </span>)}
        </div>}
      </div>

      {schedule?.source === 'demo' && <p className="org-cal-source-note" role="note">{schedule.sourceNote}</p>}

      {loadingSchedule && <LoadingState label="正在读取忙闲时间…" />}
      {!loadingSchedule && scheduleError && <ErrorState title="读取失败" description={scheduleError} onRetry={() => setAnchorDate((current) => new Date(current))} />}

      {!loadingSchedule && !scheduleError && schedule && <div className="org-cal-stage">
        {period === 'day' && <DayTimeline
          day={anchorDate}
          hours={hourRows}
          blocks={schedule.blocks}
          workStart={schedule.workingHoursStart}
          workEnd={schedule.workingHoursEnd}
        />}
        {period === 'week' && <WeekGrid
          days={weekDays}
          hours={hourRows}
          blocks={schedule.blocks}
          workStart={schedule.workingHoursStart}
          workEnd={schedule.workingHoursEnd}
        />}
        {period === 'month' && <MonthGrid
          days={monthDays}
          anchor={anchorDate}
          blocks={schedule.blocks}
          onSelectDay={(day) => {
            setAnchorDate(startOfDay(day))
            setPeriod('day')
          }}
        />}
      </div>}
    </div>}

    {pickerOpen && <PersonPickerDialog
      employees={activeEmployees}
      selectedEmployeeId={selectedEmployeeId}
      query={pickerQuery}
      availabilityFilter={availabilityFilter}
      onQueryChange={setPickerQuery}
      onAvailabilityFilterChange={setAvailabilityFilter}
      onSelect={(employeeId) => {
        setSelectedEmployeeId(employeeId)
        setPickerOpen(false)
      }}
      onClose={() => setPickerOpen(false)}
    />}
  </section>
}

function PersonPickerDialog({
  employees,
  selectedEmployeeId,
  query,
  availabilityFilter,
  onQueryChange,
  onAvailabilityFilterChange,
  onSelect,
  onClose,
}: {
  employees: EmployeeOption[]
  selectedEmployeeId: string | null
  query: string
  availabilityFilter: AvailabilityFilter
  onQueryChange: (value: string) => void
  onAvailabilityFilterChange: (value: AvailabilityFilter) => void
  onSelect: (employeeId: string) => void
  onClose: () => void
}) {
  const dialogRef = useOverlayFocus<HTMLElement>(true, onClose)
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return employees.filter((employee) => {
      const matchesAvailability = availabilityFilter === 'all'
        || (availabilityFilter === 'available' && employee.isAvailableForOrder)
        || (availabilityFilter === 'unavailable' && !employee.isAvailableForOrder)
      if (!matchesAvailability) return false
      if (!needle) return true
      const haystack = [employee.employeeName, employee.email, employee.department, employee.skills]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(needle)
    })
  }, [employees, query, availabilityFilter])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section
      ref={dialogRef}
      tabIndex={-1}
      className="modal-card org-cal-picker-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-cal-picker-title"
    >
      <header className="modal-header">
        <div>
          <h2 id="org-cal-picker-title">切换人员</h2>
          <p>搜索或按接单状态筛选，选择后将刷新下方忙闲日历。</p>
        </div>
        <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" onClick={onClose}>×</button>
      </header>
      <div className="modal-content org-cal-picker-content">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          onSearch={onQueryChange}
          onClear={() => onQueryChange('')}
          placeholder="搜索姓名、邮箱、部门或技能"
          ariaLabel="搜索人员"
        />
        <div className="org-cal-filter-chips" role="group" aria-label="接单状态筛选">
          {([
            { id: 'all', label: '全部' },
            { id: 'available', label: '可接单' },
            { id: 'unavailable', label: '不可接单' },
          ] as const).map((option) => <button
            key={option.id}
            type="button"
            className={availabilityFilter === option.id ? 'is-active' : undefined}
            aria-pressed={availabilityFilter === option.id}
            onClick={() => onAvailabilityFilterChange(option.id)}
          >{option.label}</button>)}
          <span className="org-cal-filter-count">共 {filtered.length} 人</span>
        </div>
        {filtered.length === 0
          ? <EmptyState title="没有匹配人员" description="调整搜索词或状态筛选后再试。" />
          : <ul className="org-cal-picker-list">
            {filtered.map((employee) => {
              const selected = employee.id === selectedEmployeeId
              return <li key={employee.id}>
                <button
                  type="button"
                  className={selected ? 'org-cal-picker-item is-selected' : 'org-cal-picker-item'}
                  onClick={() => onSelect(employee.id)}
                >
                  <Avatar name={employee.employeeName} />
                  <span className="org-cal-picker-item-copy">
                    <strong>{employee.employeeName}</strong>
                    <small>{employee.department || '未设置部门'}{employee.email ? ` · ${employee.email}` : ''}</small>
                    {employee.skills && <em>{employee.skills}</em>}
                  </span>
                  <span className={employee.isAvailableForOrder ? 'org-cal-pill is-available' : 'org-cal-pill is-busy'}>
                    {employee.isAvailableForOrder ? '可接单' : '不可接单'}
                  </span>
                </button>
              </li>
            })}
          </ul>}
      </div>
    </section>
  </div>
}

type CalendarDensity = 'day' | 'week' | 'month'
type HoverPlacement = 'right' | 'left' | 'bottom' | 'top'

function resolveHoverPlacement(rect: DOMRect, prefer: HoverPlacement): { top: number; left: number; placement: HoverPlacement } {
  const tipWidth = 300
  const tipHeight = 168
  const gap = 12
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

  const candidates: HoverPlacement[] = prefer === 'bottom' || prefer === 'top'
    ? [prefer, prefer === 'bottom' ? 'top' : 'bottom', 'right', 'left']
    : [prefer, prefer === 'right' ? 'left' : 'right', 'bottom', 'top']

  for (const placement of candidates) {
    if (placement === 'right' && rect.right + gap + tipWidth <= window.innerWidth - 8) {
      return { placement, left: rect.right + gap, top: clamp(rect.top, 8, window.innerHeight - tipHeight - 8) }
    }
    if (placement === 'left' && rect.left - gap - tipWidth >= 8) {
      return { placement, left: rect.left - gap - tipWidth, top: clamp(rect.top, 8, window.innerHeight - tipHeight - 8) }
    }
    if (placement === 'bottom' && rect.bottom + gap + tipHeight <= window.innerHeight - 8) {
      return { placement, left: clamp(rect.left, 8, window.innerWidth - tipWidth - 8), top: rect.bottom + gap }
    }
    if (placement === 'top' && rect.top - gap - tipHeight >= 8) {
      return { placement, left: clamp(rect.left, 8, window.innerWidth - tipWidth - 8), top: rect.top - gap - tipHeight }
    }
  }

  return {
    placement: 'bottom',
    left: clamp(rect.left, 8, window.innerWidth - tipWidth - 8),
    top: clamp(rect.bottom + gap, 8, window.innerHeight - tipHeight - 8),
  }
}

function ScheduleBlockHoverCard({
  block,
  className,
  style,
  density,
  preferPlacement = 'right',
  children,
}: {
  block: ScheduleBlock
  className: string
  style?: CSSProperties
  density: CalendarDensity
  preferPlacement?: HoverPlacement
  children: ReactNode
}) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<number | null>(null)
  const unmountTimer = useRef<number | null>(null)
  const enterFrame = useRef<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: 'right' as HoverPlacement })
  const start = new Date(block.start)
  const end = new Date(block.end)
  const title = block.subject || SCHEDULE_STATUS_LABELS[block.status]

  const clearTimers = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    if (unmountTimer.current != null) {
      window.clearTimeout(unmountTimer.current)
      unmountTimer.current = null
    }
    if (enterFrame.current != null) {
      window.cancelAnimationFrame(enterFrame.current)
      enterFrame.current = null
    }
  }

  const show = () => {
    clearTimers()
    const rect = targetRef.current?.getBoundingClientRect()
    if (!rect) return
    setCoords(resolveHoverPlacement(rect, preferPlacement))
    setMounted(true)
    enterFrame.current = window.requestAnimationFrame(() => {
      enterFrame.current = window.requestAnimationFrame(() => setVisible(true))
    })
  }

  const hideSoon = () => {
    clearTimers()
    hideTimer.current = window.setTimeout(() => {
      setVisible(false)
      unmountTimer.current = window.setTimeout(() => setMounted(false), 170)
    }, 90)
  }

  useEffect(() => () => clearTimers(), [])

  return <>
    <div
      ref={targetRef}
      className={`${className}${visible ? ' is-hovered' : ''}`}
      style={style}
      tabIndex={0}
      data-density={density}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={hideSoon}
      aria-describedby={mounted ? `org-cal-tip-${block.id}` : undefined}
    >
      {children}
    </div>
    {mounted && createPortal(
      <div
        id={`org-cal-tip-${block.id}`}
        className={`org-cal-hover-card ${statusClass(block.status)} is-${coords.placement}${visible ? ' is-visible' : ''}`}
        role="tooltip"
        style={{ top: coords.top, left: coords.left }}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
      >
        <div className="org-cal-hover-accent" aria-hidden="true" />
        <div className="org-cal-hover-body">
          <div className="org-cal-hover-card-top">
            <strong>{title}</strong>
            <span className={`org-cal-status-chip ${statusClass(block.status)}`}>{SCHEDULE_STATUS_LABELS[block.status]}</span>
          </div>
          <div className="org-cal-hover-time">
            <span>{formatDayShort(start)}</span>
            <strong>{formatClock(start)} – {formatClock(end)}</strong>
            <em>{blockDurationLabel(start, end)}</em>
          </div>
          <div className="org-cal-hover-meta">
            <span>{block.location || '未填写地点'}</span>
            <span>{sourceLabel(block.source)}</span>
          </div>
        </div>
      </div>,
      document.body,
    )}
  </>
}

function DayTimeline({
  day,
  hours,
  blocks,
  workStart,
  workEnd,
}: {
  day: Date
  hours: number[]
  blocks: ScheduleBlock[]
  workStart: number
  workEnd: number
}) {
  const dayBlocks = blocksOverlappingDay(blocks, day)
  const totalMinutes = (workEnd - workStart) * 60

  return <div className="org-cal-day-view" role="grid" aria-label="日视图忙闲">
    <div className="org-cal-day-hours">
      {hours.map((hour) => <div key={hour} className="org-cal-hour-label">{`${String(hour).padStart(2, '0')}:00`}</div>)}
    </div>
    <div className="org-cal-day-track" style={{ gridTemplateRows: `repeat(${hours.length}, 56px)` }}>
      {hours.map((hour) => <div key={hour} className="org-cal-hour-lane" />)}
      {dayBlocks.map((block) => {
        const start = new Date(block.start)
        const end = new Date(block.end)
        const dayStart = new Date(day)
        dayStart.setHours(workStart, 0, 0, 0)
        const dayEnd = new Date(day)
        dayEnd.setHours(workEnd, 0, 0, 0)
        const clippedStart = start < dayStart ? dayStart : start
        const clippedEnd = end > dayEnd ? dayEnd : end
        if (clippedEnd <= clippedStart) return null
        const top = ((clippedStart.getHours() * 60 + clippedStart.getMinutes()) - workStart * 60) / totalMinutes * 100
        const height = ((clippedEnd.getTime() - clippedStart.getTime()) / 60000) / totalMinutes * 100
        const minutes = Math.max(15, Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60000))
        const compact = minutes < 45
        return <ScheduleBlockHoverCard
          key={block.id}
          block={block}
          density="day"
          preferPlacement="right"
          className={`org-cal-event-card ${statusClass(block.status)}${compact ? ' is-compact' : ''}`}
          style={{ top: `${Math.max(0, top)}%`, height: `${Math.max(7, height)}%` }}
        >
          <div className="org-cal-event-inner">
            <span className="org-cal-event-time">{formatClock(clippedStart)} – {formatClock(clippedEnd)}</span>
            <strong>{block.subject || SCHEDULE_STATUS_LABELS[block.status]}</strong>
            {!compact && <small>{SCHEDULE_STATUS_LABELS[block.status]}{block.location ? ` · ${block.location}` : ''}</small>}
          </div>
        </ScheduleBlockHoverCard>
      })}
      {dayBlocks.length === 0 && <div className="org-cal-free-banner">全天空闲，适合派发新工单</div>}
    </div>
  </div>
}

function WeekGrid({
  days,
  hours,
  blocks,
  workStart,
  workEnd,
}: {
  days: Date[]
  hours: number[]
  blocks: ScheduleBlock[]
  workStart: number
  workEnd: number
}) {
  const totalMinutes = (workEnd - workStart) * 60
  return <div className="org-cal-week-view" role="grid" aria-label="周视图忙闲">
    <div className="org-cal-week-header">
      <span className="org-cal-week-gutter" />
      {days.map((day) => <div key={day.toISOString()} className={sameDay(day, new Date()) ? 'org-cal-week-day is-today' : 'org-cal-week-day'}>
        <strong>{day.getDate()}</strong>
        <small>{new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(day)}</small>
      </div>)}
    </div>
    <div className="org-cal-week-body">
      <div className="org-cal-week-hours" style={{ gridTemplateRows: `repeat(${hours.length}, 52px)` }}>
        {hours.map((hour) => <div key={hour}>{`${String(hour).padStart(2, '0')}:00`}</div>)}
      </div>
      {days.map((day) => {
        const dayBlocks = blocksOverlappingDay(blocks, day)
        return <div key={day.toISOString()} className="org-cal-week-column" style={{ gridTemplateRows: `repeat(${hours.length}, 52px)` }}>
          {hours.map((hour) => <div key={hour} className="org-cal-hour-lane" />)}
          {dayBlocks.map((block) => {
            const start = new Date(block.start)
            const end = new Date(block.end)
            const dayStart = new Date(day)
            dayStart.setHours(workStart, 0, 0, 0)
            const dayEnd = new Date(day)
            dayEnd.setHours(workEnd, 0, 0, 0)
            const clippedStart = start < dayStart ? dayStart : start
            const clippedEnd = end > dayEnd ? dayEnd : end
            if (clippedEnd <= clippedStart) return null
            const top = ((clippedStart.getHours() * 60 + clippedStart.getMinutes()) - workStart * 60) / totalMinutes * 100
            const height = ((clippedEnd.getTime() - clippedStart.getTime()) / 60000) / totalMinutes * 100
            const minutes = Math.max(15, Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60000))
            return <ScheduleBlockHoverCard
              key={block.id}
              block={block}
              density="week"
              preferPlacement="bottom"
              className={`org-cal-week-event ${statusClass(block.status)}${minutes < 40 ? ' is-compact' : ''}`}
              style={{ top: `${Math.max(0, top)}%`, height: `${Math.max(5.5, height)}%` }}
            >
              <div className="org-cal-event-inner">
                <span className="org-cal-event-time">{formatClock(clippedStart)}</span>
                <strong>{block.subject || SCHEDULE_STATUS_LABELS[block.status]}</strong>
              </div>
            </ScheduleBlockHoverCard>
          })}
        </div>
      })}
    </div>
  </div>
}

function MonthGrid({
  days,
  anchor,
  blocks,
  onSelectDay,
}: {
  days: Date[]
  anchor: Date
  blocks: ScheduleBlock[]
  onSelectDay: (day: Date) => void
}) {
  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']
  return <div className="org-cal-month-view" role="grid" aria-label="月视图忙闲">
    <div className="org-cal-month-weekdays">
      {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
    </div>
    <div className="org-cal-month-cells">
      {days.map((day) => {
        const inMonth = day.getMonth() === anchor.getMonth()
        const dayBlocks = blocksOverlappingDay(blocks, day)
        const status = dayBlocks.length === 0 ? 'free' : dominantStatus(dayBlocks)
        return <button
          key={day.toISOString()}
          type="button"
          className={[
            'org-cal-month-cell',
            statusClass(status),
            inMonth ? '' : 'is-outside',
            sameDay(day, new Date()) ? 'is-today' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSelectDay(day)}
        >
          <div className="org-cal-month-cell-top">
            <strong>{day.getDate()}</strong>
            <span className={`org-cal-status-chip ${statusClass(status)}`}>{SCHEDULE_STATUS_LABELS[status]}</span>
          </div>
          {dayBlocks.length === 0
            ? <p className="org-cal-month-free">全天空闲</p>
            : <div className="org-cal-month-events" onClick={(event) => event.stopPropagation()}>
              {dayBlocks.slice(0, 2).map((block) => <ScheduleBlockHoverCard
                key={block.id}
                block={block}
                density="month"
                preferPlacement="top"
                className={`org-cal-month-event-chip ${statusClass(block.status)}`}
              >
                <i aria-hidden="true" />
                <span className="org-cal-event-time">{formatClock(new Date(block.start))}</span>
                <strong>{block.subject || SCHEDULE_STATUS_LABELS[block.status]}</strong>
              </ScheduleBlockHoverCard>)}
              {dayBlocks.length > 2 && <span className="org-cal-month-more">+{dayBlocks.length - 2} 段</span>}
            </div>}
        </button>
      })}
    </div>
  </div>
}
