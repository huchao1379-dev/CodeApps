import { useMemo, useState } from 'react'
import { FilterBar, type DatePeriodValue, type FilterDefinition, type FilterValues } from '../../../shared/components'
import { PRIORITY, PRIORITY_LABELS, STATUS_LABELS, WORK_ORDER_STATUS, type DepartmentOption, type EmployeeOption, type ServiceCategoryOption, type WorkOrder, type WorkOrderStatus } from '../types/workOrder.types'

const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]
const COMPLETED_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.closed]
const STATUS_ORDER: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold, WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.closed, WORK_ORDER_STATUS.cancelled]
const PRIORITY_CLASS = { [PRIORITY.low]: 'low', [PRIORITY.medium]: 'medium', [PRIORITY.high]: 'high', [PRIORITY.critical]: 'critical' }

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDatePeriodBounds(value: DatePeriodValue): { start: number; end: number } | null {
  if (value.period === 'all' || !value.anchorDate) return null
  const start = new Date(`${value.anchorDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  if (value.period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (value.period === 'month') start.setDate(1)
  const end = new Date(start)
  if (value.period === 'day') end.setDate(end.getDate() + 1)
  if (value.period === 'week') end.setDate(end.getDate() + 7)
  if (value.period === 'month') end.setMonth(end.getMonth() + 1)
  return { start: start.getTime(), end: end.getTime() }
}

function filterString(filters: FilterValues, key: string): string {
  const value = filters[key]
  return typeof value === 'string' ? value : 'all'
}

function createdPeriod(filters: FilterValues): DatePeriodValue {
  const value = filters.created
  return value && typeof value === 'object' && !Array.isArray(value) && 'period' in value
    ? value as DatePeriodValue
    : { period: 'all', anchorDate: localDateKey(new Date()) }
}

function makeInitialFilters(): FilterValues {
  return {
    status: 'all', priority: 'all', department: 'all', category: 'all',
    assignee: 'all', sla: 'all',
    created: { period: 'all', anchorDate: localDateKey(new Date()) },
  }
}

function isOverdue(workOrder: WorkOrder, now: number): boolean {
  return ACTIVE_STATUSES.includes(workOrder.status)
    && Boolean(workOrder.expectedCompletionTime && new Date(workOrder.expectedCompletionTime).getTime() < now)
}

function uniqueWorkOrders(workOrders: WorkOrder[]): WorkOrder[] {
  const byId = new Map<string, WorkOrder>()
  workOrders.forEach((workOrder) => byId.set(workOrder.id, workOrder))
  return [...byId.values()]
}

export interface WorkOrderOperationsDashboardProps {
  loading: boolean
  error: string | null
  onRetry: () => void
  workOrders: WorkOrder[]
  employees: EmployeeOption[]
  departments: DepartmentOption[]
  serviceCategories: ServiceCategoryOption[]
  onOpenWorkOrders: (workOrders: WorkOrder[], filterLabel: string) => void
}

export function WorkOrderOperationsDashboard({ loading, error, onRetry, workOrders, employees, departments, serviceCategories, onOpenWorkOrders }: WorkOrderOperationsDashboardProps) {
  const [trendPeriod, setTrendPeriod] = useState<7 | 30>(7)
  const [filters, setFilters] = useState<FilterValues>(makeInitialFilters)
  const todayKey = localDateKey(new Date())
  const dateValue = createdPeriod(filters)
  const dateBounds = useMemo(() => getDatePeriodBounds(dateValue), [dateValue.period, dateValue.anchorDate])
  const statusFilter = filterString(filters, 'status')
  const priorityFilter = filterString(filters, 'priority')
  const departmentFilter = filterString(filters, 'department')
  const categoryFilter = filterString(filters, 'category')
  const assigneeFilter = filterString(filters, 'assignee')
  const slaFilter = filterString(filters, 'sla')

  const filterDefinitions: FilterDefinition[] = [
    { key: 'created', label: '创建日期', type: 'datePeriod' },
    { key: 'department', label: '部门', type: 'select', options: [{ value: 'all', label: '全部部门' }, ...departments.map((item) => ({ value: item.id, label: item.departmentName }))] },
    { key: 'category', label: '服务类别', type: 'select', options: [{ value: 'all', label: '全部类别' }, ...serviceCategories.map((item) => ({ value: item.id, label: item.serviceCategoryName }))] },
    { key: 'status', label: '状态', type: 'select', options: [{ value: 'all', label: '全部状态' }, ...STATUS_ORDER.map((value) => ({ value: String(value), label: STATUS_LABELS[value] }))] },
    { key: 'priority', label: '优先级', type: 'select', options: [{ value: 'all', label: '全部优先级' }, ...[PRIORITY.low, PRIORITY.medium, PRIORITY.high, PRIORITY.critical].map((value) => ({ value: String(value), label: PRIORITY_LABELS[value] }))] },
    { key: 'assignee', label: '负责人', type: 'select', options: [{ value: 'all', label: '全部负责人' }, ...employees.map((item) => ({ value: item.id, label: `${item.employeeName}${item.isActive ? '' : ' · 停用'}` }))] },
    { key: 'sla', label: 'SLA 时限', type: 'select', options: [{ value: 'all', label: '全部时限' }, { value: 'overdue', label: '已逾期' }, { value: 'on-track', label: '未逾期' }, { value: 'no-deadline', label: '未设置时限' }] },
  ]

  const filteredWorkOrders = useMemo(() => {
    const now = Date.now()
    return workOrders.filter((workOrder) => {
      const createdAt = new Date(workOrder.createTime).getTime()
      const matchesDate = !dateBounds || (createdAt >= dateBounds.start && createdAt < dateBounds.end)
      const matchesStatus = statusFilter === 'all' || workOrder.status === Number(statusFilter)
      const matchesPriority = priorityFilter === 'all' || workOrder.priority === Number(priorityFilter)
      const matchesDepartment = departmentFilter === 'all' || workOrder.departmentId === departmentFilter
      const matchesCategory = categoryFilter === 'all' || workOrder.serviceCategoryId === categoryFilter
      const matchesAssignee = assigneeFilter === 'all' || workOrder.assignedToId === assigneeFilter
      const overdue = isOverdue(workOrder, now)
      const hasActiveDeadline = ACTIVE_STATUSES.includes(workOrder.status) && Boolean(workOrder.expectedCompletionTime)
      const matchesSla = slaFilter === 'all'
        || (slaFilter === 'overdue' && overdue)
        || (slaFilter === 'on-track' && hasActiveDeadline && !overdue)
        || (slaFilter === 'no-deadline' && ACTIVE_STATUSES.includes(workOrder.status) && !workOrder.expectedCompletionTime)
      return matchesDate && matchesStatus && matchesPriority && matchesDepartment && matchesCategory && matchesAssignee && matchesSla
    })
  }, [workOrders, dateBounds, statusFilter, priorityFilter, departmentFilter, categoryFilter, assigneeFilter, slaFilter])

  const activeOrders = filteredWorkOrders.filter((workOrder) => ACTIVE_STATUSES.includes(workOrder.status))
  const now = Date.now()
  const overdueOrders = activeOrders.filter((workOrder) => isOverdue(workOrder, now))
  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    orders: filteredWorkOrders.filter((workOrder) => workOrder.status === status),
  }))
  const workloads = employees.filter((employee) => employee.isActive
    || activeOrders.some((workOrder) => workOrder.assignedToId === employee.id))
    .filter((employee) => departmentFilter === 'all' || employee.departmentId === departmentFilter)
    .filter((employee) => assigneeFilter === 'all' || employee.id === assigneeFilter)
    .map((employee) => ({
      employee,
      orders: activeOrders.filter((workOrder) => workOrder.assignedToId === employee.id),
    }))
    .sort((left, right) => right.orders.length - left.orders.length)
  const maxWorkload = Math.max(1, ...workloads.map(({ orders }) => orders.length))
  const dailyTrend = useMemo(() => Array.from({ length: trendPeriod }, (_, index) => {
    const day = new Date(dateBounds ? dateBounds.end - 1 : Date.now())
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - (trendPeriod - 1 - index))
    const nextDay = new Date(day)
    nextDay.setDate(nextDay.getDate() + 1)
    const orders = filteredWorkOrders.filter((workOrder) => {
      const createdAt = new Date(workOrder.createTime).getTime()
      return createdAt >= day.getTime() && createdAt < nextDay.getTime()
    })
    return {
      date: localDateKey(day),
      label: new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(day),
      orders,
      count: orders.length,
      closedOrders: filteredWorkOrders.filter((workOrder) => workOrder.closedAt
        && new Date(workOrder.closedAt).getTime() >= day.getTime()
        && new Date(workOrder.closedAt).getTime() < nextDay.getTime()),
    }
  }), [filteredWorkOrders, trendPeriod, dateBounds, todayKey])
  const trendMax = Math.max(1, ...dailyTrend.map((day) => Math.max(day.count, day.closedOrders.length)))
  const priorityCounts = [PRIORITY.low, PRIORITY.medium, PRIORITY.high, PRIORITY.critical].map((value) => ({
    value,
    label: PRIORITY_LABELS[value],
    orders: filteredWorkOrders.filter((workOrder) => workOrder.priority === value),
  }))
  const completedOrders = filteredWorkOrders.filter((workOrder) => COMPLETED_STATUSES.includes(workOrder.status))
  const resolutionRate = filteredWorkOrders.length ? Math.round(completedOrders.length / filteredWorkOrders.length * 100) : 0
  const trackedCompleted = completedOrders.filter((workOrder) => workOrder.expectedCompletionTime && workOrder.resolvedAt)
  const completedOnTime = trackedCompleted.filter((workOrder) => new Date(workOrder.resolvedAt as string).getTime() <= new Date(workOrder.expectedCompletionTime as string).getTime()).length
  const onTimeRate = trackedCompleted.length ? Math.round(completedOnTime / trackedCompleted.length * 100) : 0
  const filterCount = [statusFilter, priorityFilter, departmentFilter, categoryFilter, assigneeFilter, slaFilter]
    .filter((value) => value !== 'all').length + (dateValue.period === 'all' ? 0 : 1)
  const initialLoadFailed = Boolean(error) && workOrders.length === 0
  const dataStatus = loading ? '读取中…' : initialLoadFailed ? '数据暂不可用' : null

  const openOrders = (orders: WorkOrder[], label: string) => {
    if (orders.length > 0) onOpenWorkOrders(orders, label)
  }
  const resetFilters = () => setFilters(makeInitialFilters())

  return <section className="operations-dashboard" aria-label="服务运营概览">
    <header className="feature-heading"><div><span className="feature-eyebrow">SERVICE OPERATIONS</span><h2>服务运营概览</h2>
      <p>按工单创建日期、部门、服务类别、状态、优先级、负责人和 SLA 组合查看当前运营情况。</p></div>
      <div className="period-segment" role="group" aria-label="趋势图周期">
        <button type="button" aria-pressed={trendPeriod === 7} className={trendPeriod === 7 ? 'period-active' : ''} onClick={() => setTrendPeriod(7)}>7 天</button>
        <button type="button" aria-pressed={trendPeriod === 30} className={trendPeriod === 30 ? 'period-active' : ''} onClick={() => setTrendPeriod(30)}>30 天</button>
      </div>
    </header>

    <section className="operations-filter-band" aria-label="运营分析筛选">
      <div className="operations-filter-heading"><div><strong>多维度筛选</strong><span>{filterCount ? `${filterCount} 项已启用` : '全部工单'}</span></div>
        <button type="button" disabled={filterCount === 0} onClick={resetFilters}>重置筛选</button></div>
      <FilterBar definitions={filterDefinitions} values={filters} onChange={setFilters} />
    </section>

    <p className="operations-scope-note" role="note">
      统计范围：当前身份可读取的全部工单，共 {workOrders.length} 条。Dataverse 通过 continuation token 分批读取后汇总；筛选和图表统计基于本次完整读取快照。
    </p>

    {loading && <p className="operations-loading" role="status">正在读取 Dataverse 工单数据…</p>}
    {!loading && initialLoadFailed && <div className="operations-error" role="alert">
      <div><strong>无法读取工单数据</strong><p>{error}</p></div>
      <button className="button button-quiet" type="button" onClick={onRetry}>重试</button>
    </div>}
    {!loading && !initialLoadFailed && filteredWorkOrders.length === 0 && <p className="operations-filter-empty" role="status">当前筛选条件下没有匹配工单，请调整或重置筛选。</p>}

    <div className="operations-kpis">
      <article className="operations-kpi"><span>工单数量</span><strong>{loading || initialLoadFailed ? '—' : filteredWorkOrders.length}</strong><small>符合当前筛选条件</small></article>
      <button className={`operations-kpi operations-kpi-alert${overdueOrders.length ? ' has-overdue' : ''}`} type="button" disabled={loading || initialLoadFailed || !overdueOrders.length} onClick={() => openOrders(overdueOrders, 'SLA 已逾期')}>
        <span>SLA 超时监控</span><strong>{loading || initialLoadFailed ? '—' : overdueOrders.length}</strong><small>活动工单 · 点击查看超时记录</small></button>
      <article className="operations-kpi"><span>解决 / 关闭率</span><strong>{loading || initialLoadFailed ? '—' : `${resolutionRate}%`}</strong><small>{dataStatus ?? `${completedOrders.length} / ${filteredWorkOrders.length} 张工单`}</small></article>
      <article className="operations-kpi"><span>按时解决率</span><strong>{loading || initialLoadFailed ? '—' : trackedCompleted.length ? `${onTimeRate}%` : '—'}</strong><small>{dataStatus ?? `有时限且已解决/关闭：${trackedCompleted.length}`}</small></article>
    </div>

    <div className="operations-chart-grid">
      <section className="operations-panel trend-panel"><header><div><h3>工单处理趋势</h3><p>新建与关闭数量；点击日期联动查看当日处理工单</p></div><div className="chart-legend"><span><i className="legend-created" />新建</span><span><i className="legend-closed" />关闭</span></div></header>
        <div className={`trend-chart${trendPeriod === 30 ? ' trend-chart-month' : ''}`} role="list" aria-label={`${trendPeriod} 天工单处理趋势`}>
          {dailyTrend.map((day) => <button className="trend-day" type="button" role="listitem" key={day.date} disabled={day.orders.length === 0 && day.closedOrders.length === 0}
            aria-label={`${day.label} 新建 ${day.count} 张，关闭 ${day.closedOrders.length} 张`} onClick={() => openOrders(uniqueWorkOrders([...day.orders, ...day.closedOrders]), `${day.label}工单处理`)}>
            <span className="trend-bars"><i className="trend-created" style={{ height: `${Math.max(day.count ? 8 : 2, day.count / trendMax * 100)}%` }} /><i className="trend-closed" style={{ height: `${Math.max(day.closedOrders.length ? 8 : 2, day.closedOrders.length / trendMax * 100)}%` }} /></span>
            <span className="trend-day-label">{trendPeriod === 7 || day.label.endsWith('1') || day.label.endsWith('15') ? day.label : ''}</span>
          </button>)}
        </div>
      </section>

      <section className="operations-panel status-panel"><header><div><h3>工单状态分布</h3><p>基于当前筛选 · 点击状态查看对应工单</p></div></header>
        <div className="status-distribution">{statusCounts.map(({ status, orders }) => <button key={status} type="button" className="status-distribution-row" disabled={!orders.length}
          onClick={() => openOrders(orders, `${STATUS_LABELS[status]}工单`)}>
          <span>{STATUS_LABELS[status]}</span><span className="status-distribution-track"><i style={{ width: `${filteredWorkOrders.length ? orders.length / filteredWorkOrders.length * 100 : 0}%` }} /></span><strong>{orders.length}</strong>
        </button>)}</div>
      </section>

      <section className="operations-panel workload-panel"><header><div><h3>工程师工作负载</h3><p>统计已分派、处理中和等待中的活动工单</p></div></header>
        {workloads.length === 0 ? <div className="analysis-empty">{loading ? '正在读取人员负载…' : '没有可分析的工程师记录'}</div> : <div className="workload-chart">{workloads.map(({ employee, orders }) => {
          const full = employee.maxTaskLoad != null && orders.length >= employee.maxTaskLoad
          const denominator = employee.maxTaskLoad ?? maxWorkload
          return <button key={employee.id} type="button" className="workload-row" disabled={!orders.length}
            onClick={() => openOrders(orders, `${employee.employeeName}的活动工单`)}>
            <span className="workload-person">{employee.employeeName}<small>{employee.department ?? '未设置部门'} · {employee.isActive ? '在职' : '停用'}</small></span>
            <span className="workload-bar"><i className={full ? 'workload-bar-full' : ''} style={{ width: `${Math.min(100, orders.length / Math.max(1, denominator) * 100)}%` }} /></span>
            <strong>{orders.length}<small> / {employee.maxTaskLoad ?? '∞'}</small></strong>
          </button>
        })}</div>}
      </section>

      <section className="operations-panel priority-panel"><header><div><h3>优先级分布</h3><p>基于当前筛选 · 点击优先级联动工单队列</p></div></header>
        <div className="priority-distribution">{priorityCounts.map((item) => <button key={item.value} type="button" disabled={!item.orders.length}
          onClick={() => openOrders(item.orders, `${item.label}优先级工单`)}>
          <span className={`priority-label priority-${PRIORITY_CLASS[item.value]}`}>{item.label}</span><strong>{item.orders.length}</strong>
        </button>)}</div>
        <p className="analysis-footnote">SLA 逾期、状态、人员负载和优先级图表均可打开对应工单列表。</p>
      </section>
    </div>
  </section>
}
