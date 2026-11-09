import { useMemo, useState } from 'react'
import {
  AreaTrendChart,
  CapacityGaugeChart,
  DonutChart,
  StackedCompositionChart,
} from '../../../shared/components'
import { PRIORITY, PRIORITY_LABELS, STATUS_LABELS, WORK_ORDER_STATUS, type EmployeeOption, type WorkOrder, type WorkOrderStatus } from '../types/workOrder.types'

const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]
const COMPLETED_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.closed]
const STATUS_ORDER: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold, WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.closed, WORK_ORDER_STATUS.cancelled]
const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  [WORK_ORDER_STATUS.new]: '#e0a24a',
  [WORK_ORDER_STATUS.assigned]: '#5b9bd5',
  [WORK_ORDER_STATUS.inProgress]: '#7b6fd0',
  [WORK_ORDER_STATUS.onHold]: '#8b95a7',
  [WORK_ORDER_STATUS.resolved]: '#4e9d7c',
  [WORK_ORDER_STATUS.closed]: '#657286',
  [WORK_ORDER_STATUS.cancelled]: '#c84c3d',
}
const PRIORITY_COLORS = {
  [PRIORITY.low]: '#8aa0b8',
  [PRIORITY.medium]: '#5b9bd5',
  [PRIORITY.high]: '#e0a24a',
  [PRIORITY.critical]: '#c84c3d',
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  departments?: unknown
  serviceCategories?: unknown
  onOpenWorkOrders: (workOrders: WorkOrder[], filterLabel: string) => void
}

type TrendGrain = 'day' | 'week' | 'month'

type TrendBucket = {
  id: string
  label: string
  createdOrders: WorkOrder[]
  closedOrders: WorkOrder[]
}

export function WorkOrderOperationsDashboard({
  loading,
  error,
  onRetry,
  workOrders,
  employees,
  onOpenWorkOrders,
}: WorkOrderOperationsDashboardProps) {
  const [trendGrain, setTrendGrain] = useState<TrendGrain>('week')
  const [selectedStatusCurves, setSelectedStatusCurves] = useState<WorkOrderStatus[]>([])
  const todayKey = localDateKey(new Date())

  const activeOrders = workOrders.filter((workOrder) => ACTIVE_STATUSES.includes(workOrder.status))
  const now = Date.now()
  const overdueOrders = activeOrders.filter((workOrder) => isOverdue(workOrder, now))

  const statusBuckets = STATUS_ORDER.map((status) => ({
    status,
    orders: workOrders.filter((workOrder) => workOrder.status === status),
  }))

  const workloads = employees.filter((employee) => employee.isActive
    || activeOrders.some((workOrder) => workOrder.assignedToId === employee.id))
    .map((employee) => ({
      employee,
      orders: activeOrders.filter((workOrder) => workOrder.assignedToId === employee.id),
    }))
    .sort((left, right) => right.orders.length - left.orders.length)

  const trendBuckets = useMemo(() => {
    const anchor = new Date()
    const collect = (start: Date, end: Date, id: string, label: string): TrendBucket => ({
      id,
      label,
      createdOrders: workOrders.filter((workOrder) => {
        const createdAt = new Date(workOrder.createTime).getTime()
        return createdAt >= start.getTime() && createdAt < end.getTime()
      }),
      closedOrders: workOrders.filter((workOrder) => workOrder.closedAt
        && new Date(workOrder.closedAt).getTime() >= start.getTime()
        && new Date(workOrder.closedAt).getTime() < end.getTime()),
    })

    if (trendGrain === 'day') {
      const dayStart = new Date(anchor)
      dayStart.setHours(0, 0, 0, 0)
      return Array.from({ length: 24 }, (_, hour) => {
        const start = new Date(dayStart)
        start.setHours(hour, 0, 0, 0)
        const end = new Date(start)
        end.setHours(hour + 1, 0, 0, 0)
        return collect(start, end, `${localDateKey(dayStart)}T${String(hour).padStart(2, '0')}`, `${hour}:00`)
      })
    }

    if (trendGrain === 'month') {
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
      return Array.from({ length: daysInMonth }, (_, index) => {
        const start = new Date(monthStart)
        start.setDate(index + 1)
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(start.getDate() + 1)
        return collect(
          start,
          end,
          localDateKey(start),
          new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(start),
        )
      })
    }

    const weekEnd = new Date(anchor)
    weekEnd.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(weekEnd)
      start.setDate(weekEnd.getDate() - (6 - index))
      const end = new Date(start)
      end.setDate(start.getDate() + 1)
      return collect(
        start,
        end,
        localDateKey(start),
        new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(start),
      )
    })
  }, [workOrders, trendGrain, todayKey])

  const priorityBuckets = [PRIORITY.low, PRIORITY.medium, PRIORITY.high, PRIORITY.critical].map((value) => ({
    value,
    label: PRIORITY_LABELS[value],
    orders: workOrders.filter((workOrder) => workOrder.priority === value),
  }))

  const completedOrders = workOrders.filter((workOrder) => COMPLETED_STATUSES.includes(workOrder.status))
  const resolutionRate = workOrders.length ? Math.round(completedOrders.length / workOrders.length * 100) : 0
  const trackedCompleted = completedOrders.filter((workOrder) => workOrder.expectedCompletionTime && workOrder.resolvedAt)
  const completedOnTime = trackedCompleted.filter((workOrder) => new Date(workOrder.resolvedAt as string).getTime() <= new Date(workOrder.expectedCompletionTime as string).getTime()).length
  const onTimeRate = trackedCompleted.length ? Math.round(completedOnTime / trackedCompleted.length * 100) : 0
  const initialLoadFailed = Boolean(error) && workOrders.length === 0
  const dataStatus = loading ? '读取中…' : initialLoadFailed ? '数据暂不可用' : null

  const openOrders = (orders: WorkOrder[], label: string) => {
    if (orders.length > 0) onOpenWorkOrders(orders, label)
  }

  const toggleStatusCurve = (status: WorkOrderStatus) => {
    setSelectedStatusCurves((current) => current.includes(status)
      ? current.filter((item) => item !== status)
      : [...current, status])
  }

  const overlaySeries = selectedStatusCurves.map((status) => ({
    id: String(status),
    label: STATUS_LABELS[status],
    color: STATUS_COLORS[status],
  }))

  const trendPoints = trendBuckets.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    value: bucket.createdOrders.length,
    secondaryValue: bucket.closedOrders.length,
    overlays: Object.fromEntries(STATUS_ORDER.map((status) => [
      String(status),
      bucket.createdOrders.filter((workOrder) => workOrder.status === status).length,
    ])),
    meta: `点击查看 ${bucket.label} 相关工单`,
  }))
  const trendGrainCopy: Record<TrendGrain, string> = {
    day: '按小时查看当日新建与关闭',
    week: '按天查看近 7 日新建与关闭',
    month: '按天查看本月新建与关闭',
  }

  const statusItems = statusBuckets.map(({ status, orders }) => ({
    id: String(status),
    label: STATUS_LABELS[status],
    value: orders.length,
    color: STATUS_COLORS[status],
    meta: '点击查看对应状态工单',
  }))

  const capacityItems = workloads.map(({ employee, orders }) => ({
    id: employee.id,
    label: employee.employeeName,
    subtitle: `${employee.department ?? '未设置部门'} · ${employee.isActive ? '在职' : '停用'}`,
    value: orders.length,
    capacity: employee.maxTaskLoad,
  }))

  const priorityItems = priorityBuckets.map((item) => ({
    id: String(item.value),
    label: item.label,
    value: item.orders.length,
    color: PRIORITY_COLORS[item.value],
  }))

  return <section className="operations-dashboard" aria-label="服务运营概览">
    <header className="feature-heading"><div><span className="feature-eyebrow">SERVICE OPERATIONS</span><h2>服务运营概览</h2>
      <p>用图表直观查看工单趋势、工程师负载、状态结构与优先级组成。</p></div>
    </header>

    <p className="operations-scope-note" role="note">
      统计范围：当前身份可读取的全部工单，共 {workOrders.length} 条。Dataverse 通过 continuation token 分批读取后汇总。
    </p>

    {loading && <p className="operations-loading" role="status">正在读取 Dataverse 工单数据…</p>}
    {!loading && initialLoadFailed && <div className="operations-error" role="alert">
      <div><strong>无法读取工单数据</strong><p>{error}</p></div>
      <button className="button button-quiet" type="button" onClick={onRetry}>重试</button>
    </div>}
    {!loading && !initialLoadFailed && workOrders.length === 0 && <p className="operations-filter-empty" role="status">当前没有可展示的工单数据。</p>}

    <div className="operations-kpis">
      <article className="operations-kpi"><span>工单数量</span><strong>{loading || initialLoadFailed ? '—' : workOrders.length}</strong><small>当前可读取记录</small></article>
      <button className={`operations-kpi operations-kpi-alert${overdueOrders.length ? ' has-overdue' : ''}`} type="button" disabled={loading || initialLoadFailed || !overdueOrders.length} onClick={() => openOrders(overdueOrders, 'SLA 已逾期')}>
        <span>SLA 超时监控</span><strong>{loading || initialLoadFailed ? '—' : overdueOrders.length}</strong><small>活动工单 · 点击查看超时记录</small></button>
      <article className="operations-kpi"><span>解决 / 关闭率</span><strong>{loading || initialLoadFailed ? '—' : `${resolutionRate}%`}</strong><small>{dataStatus ?? `${completedOrders.length} / ${workOrders.length} 张工单`}</small></article>
      <article className="operations-kpi"><span>按时解决率</span><strong>{loading || initialLoadFailed ? '—' : trackedCompleted.length ? `${onTimeRate}%` : '—'}</strong><small>{dataStatus ?? `有时限且已解决/关闭：${trackedCompleted.length}`}</small></article>
    </div>

    <div className="operations-chart-grid">
      <section className="operations-panel trend-panel">
        <header>
          <div>
            <h3>工单处理趋势</h3>
            <p>{trendGrainCopy[trendGrain]}；可点选状态叠加对比曲线，点击坐标联动列表</p>
          </div>
          <div className="period-segment chart-grain-segment" role="group" aria-label="趋势图时间粒度">
            <button type="button" aria-pressed={trendGrain === 'day'} className={trendGrain === 'day' ? 'period-active' : ''} onClick={() => setTrendGrain('day')}>日</button>
            <button type="button" aria-pressed={trendGrain === 'week'} className={trendGrain === 'week' ? 'period-active' : ''} onClick={() => setTrendGrain('week')}>周</button>
            <button type="button" aria-pressed={trendGrain === 'month'} className={trendGrain === 'month' ? 'period-active' : ''} onClick={() => setTrendGrain('month')}>月</button>
          </div>
        </header>
        <div className="operations-chart-body">
          <div className="trend-status-curve-bar" role="group" aria-label="添加状态对比曲线">
            <span className="trend-status-curve-label">添加状态曲线</span>
            <div className="trend-status-curve-chips">
              {STATUS_ORDER.map((status) => {
                const active = selectedStatusCurves.includes(status)
                return <button
                  key={status}
                  type="button"
                  className={`trend-status-chip${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  style={{ ['--chip-color' as string]: STATUS_COLORS[status] }}
                  onClick={() => toggleStatusCurve(status)}
                >
                  <i aria-hidden="true" />
                  {STATUS_LABELS[status]}
                </button>
              })}
            </div>
            {selectedStatusCurves.length > 0 && <button type="button" className="trend-status-clear" onClick={() => setSelectedStatusCurves([])}>清除叠加</button>}
          </div>
          <AreaTrendChart
            points={trendPoints}
            primaryLabel="新建"
            secondaryLabel="关闭"
            overlaySeries={overlaySeries}
            height={selectedStatusCurves.length > 0 ? 188 : 168}
            denseLabels={trendGrain !== 'week'}
            emptyLabel={loading ? '正在计算趋势…' : '所选周期暂无趋势数据'}
            onPointActivate={(point) => {
              const bucket = trendBuckets.find((item) => item.id === point.id)
              if (!bucket) return
              const linked = selectedStatusCurves.length > 0
                ? bucket.createdOrders.filter((workOrder) => selectedStatusCurves.includes(workOrder.status))
                : uniqueWorkOrders([...bucket.createdOrders, ...bucket.closedOrders])
              openOrders(
                linked.length > 0 ? linked : uniqueWorkOrders([...bucket.createdOrders, ...bucket.closedOrders]),
                selectedStatusCurves.length > 0
                  ? `${bucket.label} · ${selectedStatusCurves.map((status) => STATUS_LABELS[status]).join('/')}`
                  : `${bucket.label}工单处理`,
              )
            }}
          />
        </div>
      </section>

      <section className="operations-panel workload-panel">
        <header>
          <div>
            <h3>工程师工作负载</h3>
            <p>容量仪表：进度条对照最大负载，接近上限显示预警色，超出显示过载色</p>
          </div>
        </header>
        <div className="operations-chart-body">
          <CapacityGaugeChart
            items={capacityItems}
            emptyLabel={loading ? '正在读取人员负载…' : '没有可分析的工程师记录'}
            onItemActivate={(item) => {
              const bucket = workloads.find((entry) => entry.employee.id === item.id)
              if (bucket) openOrders(bucket.orders, `${bucket.employee.employeeName}的活动工单`)
            }}
          />
        </div>
      </section>

      <section className="operations-panel status-panel">
        <header>
          <div>
            <h3>工单状态分布</h3>
            <p>环形占比：一眼看出积压与流转结构，点击扇区打开对应工单</p>
          </div>
        </header>
        <div className="operations-chart-body">
          <DonutChart
            items={statusItems}
            centerLabel="工单"
            emptyLabel={loading ? '正在计算状态分布…' : '暂无状态分布'}
            onItemActivate={(item) => {
              const bucket = statusBuckets.find((entry) => String(entry.status) === item.id)
              if (bucket) openOrders(bucket.orders, `${STATUS_LABELS[bucket.status]}工单`)
            }}
          />
        </div>
      </section>

      <section className="operations-panel priority-panel">
        <header>
          <div>
            <h3>优先级组成</h3>
            <p>堆叠组成条：看紧急工单占比，点击分段联动工单队列</p>
          </div>
        </header>
        <div className="operations-chart-body">
          <StackedCompositionChart
            items={priorityItems}
            title="全部工单"
            emptyLabel={loading ? '正在计算优先级…' : '暂无优先级数据'}
            onItemActivate={(item) => {
              const bucket = priorityBuckets.find((entry) => String(entry.value) === item.id)
              if (bucket) openOrders(bucket.orders, `${bucket.label}优先级工单`)
            }}
          />
          <p className="analysis-footnote">SLA 逾期、状态、人员负载和优先级图表均可打开对应工单列表。</p>
        </div>
      </section>
    </div>
  </section>
}
