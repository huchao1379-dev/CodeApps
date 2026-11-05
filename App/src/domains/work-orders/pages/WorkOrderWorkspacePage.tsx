import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { priorityOptions, workOrderStatusOptions, getAvailableStatusTransitions } from '../config/workOrderChoices'
import {
  PRIORITY,
  PRIORITY_LABELS,
  STATUS_LABELS,
  WORK_ORDER_STATUS,
  type EmployeeOption,
  type Priority,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderStoreState,
} from '../types/workOrder.types'
import { loadWorkOrderStateFromDataverse } from '../services/dataverseWorkOrderRepository'
import {
  assignDataverseWorkOrder,
  createDataverseWorkOrder,
  transitionDataverseWorkOrder,
  unassignDataverseWorkOrder,
  updateDataverseWorkOrder,
} from '../services/dataverseWorkOrderCommands'
import {
  updateDataverseDepartment,
  updateDataverseEmployee,
  updateDataverseServiceCategory,
} from '../services/dataverseResourceCommands'
import { seedDataverseITTestData, type TestDataSeedPhase } from '../services/dataverseTestDataSeeder'
import { ResourceEditDialog, type EditableResource, type ResourceEditValues } from '../components/ResourceEditDialog'
import {
  AssignmentDialog,
  NoteDialog,
  StatusDialog,
  WorkOrderFormDialog,
} from '../components/WorkOrderActionDialogs'
import {
  DataTable,
  DetailPanel,
  EmptyState,
  FilterBar,
  LoadingState,
  BulkActionBar,
  Pagination,
  SearchInput,
  StatusBadge,
  useOverlayFocus,
} from '../../../shared/components'
import type { BulkAction, DatePeriod, FilterDefinition, FilterValues, SortState, TableColumn } from '../../../shared/components'
import { AppHeader, AppLayout, AppSidebar, PageContainer } from '../../../workbench/layout'
import { WorkOrderDispatchBoard } from '../components/WorkOrderDispatchBoard'
import { WorkOrderOperationsDashboard } from '../components/WorkOrderOperationsDashboard'
import { WorkOrderBatchActionDialog, type WorkOrderBatchAction, type WorkOrderBatchActionInput } from '../components/WorkOrderBatchActionDialog'
import './WorkOrderWorkspacePage.css'

const emptyState: WorkOrderStoreState = {
  workOrders: [], assignments: [], events: [], employees: [], departments: [], serviceCategories: [],
}
const PAGE_SIZE = 25
const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]
const localDateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function getDatePeriodBounds(period: DatePeriod, anchorDate: string): { start: number; end: number } | null {
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

type View = '概览' | '工单管理' | '派发看板' | '资源目录'
type ResourceTab = 'employees' | 'departments' | 'categories'
type DialogMode = 'create' | 'edit' | 'assign' | 'unassign' | 'status' | null

const formatDate = (value: string | null | undefined, dateOnly = false) => {
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

const statusClass: Record<WorkOrderStatus, string> = {
  [WORK_ORDER_STATUS.new]: 'new',
  [WORK_ORDER_STATUS.assigned]: 'assigned',
  [WORK_ORDER_STATUS.inProgress]: 'progress',
  [WORK_ORDER_STATUS.onHold]: 'hold',
  [WORK_ORDER_STATUS.resolved]: 'resolved',
  [WORK_ORDER_STATUS.closed]: 'closed',
  [WORK_ORDER_STATUS.cancelled]: 'cancelled',
}

const priorityClass: Record<Priority, string> = {
  [PRIORITY.low]: 'low',
  [PRIORITY.medium]: 'medium',
  [PRIORITY.high]: 'high',
  [PRIORITY.critical]: 'critical',
}

const workOrderColumns: TableColumn<WorkOrder>[] = [
  { key: 'workOrderName', title: '工单', width: 280, sortable: true, render: (_, workOrder) => <div className="work-order-cell">
    <span><strong>{workOrder.workOrderName}</strong><small>{workOrder.workOrderNumber || '编号待生成'}</small></span>
  </div> },
  { key: 'status', title: '状态', width: 105, sortable: true, render: (_, workOrder) => <StatusPill status={workOrder.status} /> },
  { key: 'priority', title: '优先级', width: 95, sortable: true, render: (_, workOrder) => <PriorityLabel priority={workOrder.priority} /> },
  { key: 'serviceCategoryLabel', title: '服务类别', width: 135, sortable: true },
  { key: 'department', title: '负责部门', width: 125, sortable: true, render: (value) => <span className="department-cell">{String(value || '—')}</span> },
  { key: 'assignedToName', title: '负责人', width: 135, sortable: true, render: (_, workOrder) => <div className="assignee-cell">
    <Avatar small name={workOrder.assignedToName} /><span>{workOrder.assignedToName ?? '待分派'}</span>
  </div> },
  { key: 'expectedCompletionTime', title: '预计完成', width: 140, sortable: true, render: (_, workOrder) => <span className="date-cell">{formatDate(workOrder.expectedCompletionTime)}</span> },
  { key: 'createTime', title: '创建时间', width: 150, sortable: true, render: (_, workOrder) => <span className="date-cell">{formatDate(workOrder.createTime)}</span> },
]

function StatusPill({ status }: { status: WorkOrderStatus }) {
  const variant = status === WORK_ORDER_STATUS.new || status === WORK_ORDER_STATUS.onHold ? 'warning'
    : status === WORK_ORDER_STATUS.assigned || status === WORK_ORDER_STATUS.inProgress ? 'info'
      : status === WORK_ORDER_STATUS.resolved ? 'success'
        : status === WORK_ORDER_STATUS.cancelled ? 'danger' : 'neutral'
  return <StatusBadge className={`work-order-status status-${statusClass[status]}`} label={STATUS_LABELS[status]} variant={variant} size="small" />
}

function PriorityLabel({ priority }: { priority: Priority }) {
  return <span className={`priority-label priority-${priorityClass[priority]}`}><i />{PRIORITY_LABELS[priority]}</span>
}

function Avatar({ name, small = false }: { name: string | null; small?: boolean }) {
  if (!name) return <span className={`avatar avatar-empty${small ? ' avatar-small' : ''}`}>待</span>
  return <span className={`avatar${small ? ' avatar-small' : ''}`}>{name.slice(-1)}</span>
}

function MetricCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) {
  return <article className="metric-card">
    <div className={`metric-icon metric-${tone}`}>{tone === 'purple' ? '▦' : tone === 'amber' ? '◷' : tone === 'blue' ? '↗' : '✓'}</div>
    <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    <span className={`metric-spark spark-${tone}`} aria-hidden="true">⌁</span>
  </article>
}

function WorkOrderDetail({
  workOrder,
  state,
  disabled,
  onClose,
  onEdit,
  onAssign,
  onUnassign,
  onChangeStatus,
}: {
  workOrder: WorkOrder
  state: WorkOrderStoreState
  disabled: boolean
  onClose: () => void
  onEdit: () => void
  onAssign: () => void
  onUnassign: () => void
  onChangeStatus: () => void
}) {
  const timeline = (state.events ?? []).filter((event) => event.workOrderId === workOrder.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const assignments = (state.assignments ?? []).filter((assignment) => assignment.workOrderId === workOrder.id)
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
  const terminal = workOrder.status === WORK_ORDER_STATUS.closed || workOrder.status === WORK_ORDER_STATUS.cancelled
  const canAssign = ([WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold] as readonly WorkOrderStatus[]).includes(workOrder.status)
  const canUnassign = workOrder.status === WORK_ORDER_STATUS.assigned && Boolean(workOrder.assignedToId)
  const canTransition = getAvailableStatusTransitions(workOrder).length > 0

  return <DetailPanel open title="工单详情" subtitle={workOrder.workOrderNumber || '编号生成中'} size="large" onClose={onClose}>
        <div className="detail-title-row"><StatusPill status={workOrder.status} /><PriorityLabel priority={workOrder.priority} /></div>
        <h2 className="detail-title">{workOrder.workOrderName}</h2>
        <p className="detail-description">{workOrder.issueDescription || '暂无问题描述'}</p>
        <div className="detail-actions">
          {!terminal && <button className="button button-quiet" disabled={disabled} onClick={onEdit}>编辑</button>}
          {canAssign && <button className="button button-primary" disabled={disabled || (state.employees ?? []).filter((item) => item.isActive && item.isAvailableForOrder).length === 0} onClick={onAssign}>
            {workOrder.assignedToId ? '转派' : '派发'}
          </button>}
          {canUnassign && <button className="button button-quiet" disabled={disabled} onClick={onUnassign}>撤派</button>}
          {canTransition && <button className="button button-quiet" disabled={disabled} onClick={onChangeStatus}>更新状态</button>}
        </div>

        <section className="detail-section"><div className="section-heading"><h3>工单字段</h3><span>WORK ORDER</span></div>
          <dl className="detail-grid">
            <div><dt>工单编号</dt><dd>{workOrder.workOrderNumber || '待生成'}</dd></div>
            <div><dt>工单标题</dt><dd>{workOrder.workOrderName}</dd></div>
            <div><dt>当前状态</dt><dd><StatusPill status={workOrder.status} /></dd></div>
            <div><dt>优先级</dt><dd><PriorityLabel priority={workOrder.priority} /></dd></div>
            <div><dt>当前负责人</dt><dd className="person-value"><Avatar small name={workOrder.assignedToName} />{workOrder.assignedToName ?? '待分派'}</dd></div>
            <div><dt>负责部门</dt><dd>{workOrder.department || '未指定'}</dd></div>
            <div><dt>服务类别</dt><dd>{workOrder.serviceCategoryLabel ?? '未设置'}</dd></div>
            <div><dt>创建时间</dt><dd>{formatDate(workOrder.createTime)}</dd></div>
            <div><dt>预计完成</dt><dd>{formatDate(workOrder.expectedCompletionTime)}</dd></div>
            <div><dt>解决时间</dt><dd>{formatDate(workOrder.resolvedAt)}</dd></div>
            <div><dt>关闭时间</dt><dd>{formatDate(workOrder.closedAt)}</dd></div>
            <div><dt>创建人</dt><dd>{workOrder.createdBy ?? '—'}</dd></div>
            <div><dt>最后修改</dt><dd>{formatDate(workOrder.modifiedAt)}</dd></div>
          </dl>
        </section>

        <section className="detail-section"><div className="section-heading"><h3>解决方案</h3><span>{workOrder.resolution ? '已记录' : '未记录'}</span></div>
          <p className="resolution-card">{workOrder.resolution || '尚未记录解决方案'}</p>
        </section>

        <section className="detail-section"><div className="section-heading"><h3>派发记录</h3><span>{assignments.length} RECORDS</span></div>
          {assignments.length > 0 ? <div className="assignment-list">{assignments.map((assignment) => <article className="assignment-row" key={assignment.id}>
            <span className="assignment-mark">↗</span><div><strong>{assignment.assignmentTypeLabel ?? assignment.assignmentType}</strong>
              <p>{assignment.assignedFromName ? `${assignment.assignedFromName} → ` : ''}{assignment.assignedToName ?? '未分派'}{assignment.assignmentNote ? ` · ${assignment.assignmentNote}` : ''}</p>
              <small>{assignment.assignmentNumber || '派发编号待生成'} · {assignment.assignmentSourceLabel ?? assignment.assignmentSource ?? '—'} · 操作人：{assignment.createdBy ?? '—'}</small>
            </div><time>{formatDate(assignment.assignedAt)}</time>
          </article>)}</div> : <p className="empty-history">暂无派发记录</p>}
        </section>

        <section className="detail-section"><div className="section-heading"><h3>工单历史</h3><span>{timeline.length} RECORDS</span></div>
          {timeline.length > 0 ? <div className="timeline">{timeline.map((event) => <article className="timeline-row" key={event.id}>
            <span className={`timeline-dot dot-${event.kind}`} />
            <div className="timeline-content"><strong>{event.historyTypeLabel ?? event.kind}</strong><p>{event.description}</p>
              {(event.previousStatusLabel || event.newStatusLabel || event.historyStatusLabel) && <small>
                历史状态映射：{event.previousStatusLabel ?? '—'} → {event.newStatusLabel ?? '—'}{event.historyStatusLabel ? ` · 记录状态：${event.historyStatusLabel}` : ''}
              </small>}
              {event.remarks && <small>备注：{event.remarks}</small>}
              <small>{event.historyNumber || '历史编号待生成'} · 操作人：{event.createdBy ?? '—'}</small>
              <time>{formatDate(event.occurredAt)}</time>
            </div>
          </article>)}</div> : <p className="empty-history">这张工单暂无已读取的历史记录</p>}
        </section>
  </DetailPanel>
}

function ResourceDirectory({ state, tab, query, loading, onTabChange, onQueryChange, onEditResource }: {
  state: WorkOrderStoreState
  tab: ResourceTab
  query: string
  loading: boolean
  onTabChange: (tab: ResourceTab) => void
  onQueryChange: (query: string) => void
  onEditResource: (resource: EditableResource) => void
}) {
  const normalized = query.trim().toLocaleLowerCase()
  const rows = useMemo(() => {
    if (tab === 'employees') return (state.employees ?? []).filter((row) =>
      [row.employeeName, row.email, row.department, row.skills].some((value) => value?.toLocaleLowerCase().includes(normalized)),
    )
    if (tab === 'departments') return (state.departments ?? []).filter((row) =>
      [row.departmentCode, row.departmentName, row.managerName, row.description].some((value) => value?.toLocaleLowerCase().includes(normalized)),
    )
    return (state.serviceCategories ?? []).filter((row) =>
      [row.categoryCode, row.serviceCategoryName, row.defaultDepartmentName, row.description].some((value) => value?.toLocaleLowerCase().includes(normalized)),
    )
  }, [state, tab, normalized])
  const editableRowProps = (resource: EditableResource) => ({
    tabIndex: 0,
    'data-clickable': 'true',
    onClick: () => onEditResource(resource),
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      onEditResource(resource)
    },
  })
  const editButton = (resource: EditableResource, label: string) => <button className="resource-edit-action" type="button" title={`编辑${label}`}
    aria-label={`编辑${label}`} onClick={(event) => { event.stopPropagation(); onEditResource(resource) }}>✎</button>

  return <section className="work-order-card resource-card">
    <header className="list-header"><div><div className="list-title-row"><h2>基础资源</h2><span className="result-count">{loading ? '…' : rows.length}</span></div><p>员工、部门与服务类别的 Dataverse 当前记录</p></div>
      <SearchInput value={query} onChange={onQueryChange} placeholder="搜索名称、编号或说明" ariaLabel="搜索基础资源" />
    </header>
    <div className="resource-tabs" role="tablist" aria-label="资源类型">
      <button role="tab" aria-selected={tab === 'employees'} className={tab === 'employees' ? 'resource-tab resource-tab-active' : 'resource-tab'} onClick={() => onTabChange('employees')}>员工 <span>{state.employees?.length ?? 0}</span></button>
      <button role="tab" aria-selected={tab === 'departments'} className={tab === 'departments' ? 'resource-tab resource-tab-active' : 'resource-tab'} onClick={() => onTabChange('departments')}>部门 <span>{state.departments?.length ?? 0}</span></button>
      <button role="tab" aria-selected={tab === 'categories'} className={tab === 'categories' ? 'resource-tab resource-tab-active' : 'resource-tab'} onClick={() => onTabChange('categories')}>服务类别 <span>{state.serviceCategories?.length ?? 0}</span></button>
    </div>
    {loading ? <LoadingState label="正在读取基础资源…" /> : <>
    <div className="table-scroll resource-scroll">
      {tab === 'employees' && <table className="work-order-table resource-table"><thead><tr><th>员工</th><th>部门</th><th>邮箱</th><th>性别</th><th>年龄</th><th>入职日期</th><th>接单状态</th><th>负载上限</th><th>技能</th><th aria-label="操作" /></tr></thead>
        <tbody>{(rows as NonNullable<WorkOrderStoreState['employees']>).map((employee) => <tr key={employee.id} {...editableRowProps({ type: 'employee', record: employee })}>
          <td><div className="assignee-cell"><Avatar small name={employee.employeeName} /><strong>{employee.employeeName}</strong></div></td>
          <td>{employee.department ?? '—'}</td><td>{employee.email ?? '—'}</td><td>{employee.gender ?? '—'}</td><td>{employee.age ?? '—'}</td>
          <td>{formatDate(employee.hireDate, true)}</td><td><span className={employee.isActive ? 'resource-state state-active' : 'resource-state state-inactive'}>{employee.isActive ? '在职' : '停用'}</span>
            <small className="availability-label">{employee.isAvailableForOrder ? '可接单' : '暂不可接单'}</small></td>
          <td>{employee.maxTaskLoad ?? '未设置'}</td><td className="resource-skills">{employee.skills ?? '—'}</td>
          <td className="resource-actions">{editButton({ type: 'employee', record: employee }, '员工')}</td>
        </tr>)}</tbody></table>}
      {tab === 'departments' && <table className="work-order-table resource-table"><thead><tr><th>部门编号</th><th>部门名称</th><th>部门经理</th><th>说明</th><th>成立日期</th><th>状态</th><th aria-label="操作" /></tr></thead>
        <tbody>{(rows as NonNullable<WorkOrderStoreState['departments']>).map((department) => <tr key={department.id} {...editableRowProps({ type: 'department', record: department })}>
          <td>{department.departmentCode || '—'}</td><td><strong>{department.departmentName}</strong></td><td>{department.managerName ?? '—'}</td>
          <td>{department.description ?? '—'}</td><td>{formatDate(department.establishedDate, true)}</td>
          <td><span className={department.isActive ? 'resource-state state-active' : 'resource-state state-inactive'}>{department.isActive ? '启用' : '停用'}</span></td>
          <td className="resource-actions">{editButton({ type: 'department', record: department }, '部门')}</td>
        </tr>)}</tbody></table>}
      {tab === 'categories' && <table className="work-order-table resource-table"><thead><tr><th>类别编号</th><th>服务类别</th><th>默认部门</th><th>默认优先级</th><th>说明</th><th>状态</th><th aria-label="操作" /></tr></thead>
        <tbody>{(rows as NonNullable<WorkOrderStoreState['serviceCategories']>).map((category) => <tr key={category.id} {...editableRowProps({ type: 'category', record: category })}>
          <td>{category.categoryCode || '—'}</td><td><strong>{category.serviceCategoryName}</strong></td><td>{category.defaultDepartmentName ?? '—'}</td>
          <td>{category.defaultPriority === null ? '—' : PRIORITY_LABELS[category.defaultPriority]}</td><td>{category.description ?? '—'}</td>
          <td><span className={category.isActive ? 'resource-state state-active' : 'resource-state state-inactive'}>{category.isActive ? '启用' : '停用'}</span></td>
          <td className="resource-actions">{editButton({ type: 'category', record: category }, '服务类别')}</td>
        </tr>)}</tbody></table>}
    </div>
    {rows.length === 0 && <EmptyState title={normalized ? '没有匹配的记录' : '暂无资源记录'} description={normalized ? '调整搜索词后再试。' : '该数据源当前没有可显示的记录。'} />}
    </>}
    <footer className="table-footer"><span>显示 <strong>{loading ? '—' : rows.length}</strong> 条</span><span className="demo-pagination">{loading ? '正在读取记录…' : '已读取所有可访问记录'}</span></footer>
  </section>
}

export default function WorkOrderWorkspacePage() {
  const [state, setState] = useState<WorkOrderStoreState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedWorkOrderKeys, setSelectedWorkOrderKeys] = useState<string[]>([])
  const [view, setView] = useState<View>('概览')
  const [resourceTab, setResourceTab] = useState<ResourceTab>('employees')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [createdPeriod, setCreatedPeriod] = useState<DatePeriod>('all')
  const [createdAnchorDate, setCreatedAnchorDate] = useState(() => localDateValue(new Date()))
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [sort, setSort] = useState<SortState[]>([{ field: 'createTime', direction: 'desc' }])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceEditor, setResourceEditor] = useState<EditableResource | null>(null)
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [bulkAction, setBulkAction] = useState<WorkOrderBatchAction | null>(null)
  const [pendingAssignment, setPendingAssignment] = useState<{ workOrder: WorkOrder; employee: EmployeeOption } | null>(null)
  const [bulkResults, setBulkResults] = useState<Array<{ workOrder: WorkOrder; success: boolean; message: string }> | null>(null)
  const [linkedWorkOrderIds, setLinkedWorkOrderIds] = useState<string[] | null>(null)
  const [linkedFilterLabel, setLinkedFilterLabel] = useState<string | null>(null)
  const [seedDialogOpen, setSeedDialogOpen] = useState(false)
  const [seedPhase, setSeedPhase] = useState<TestDataSeedPhase | null>(null)
  const seedDialogRef = useOverlayFocus<HTMLElement>(seedDialogOpen, () => { if (!busy) setSeedDialogOpen(false) })

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setState((current) => ({ ...current, readWarnings: undefined }))
    loadWorkOrderStateFromDataverse()
      .then((nextState) => { if (active) setState(nextState) })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '读取 Dataverse 数据失败。')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshToken])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(null), 6500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const selectedWorkOrder = state.workOrders.find((workOrder) => workOrder.id === selectedId) ?? null
  const activeDepartments = (state.departments ?? []).filter((department) => department.isActive)
  const activeCategories = (state.serviceCategories ?? []).filter((category) => category.isActive)
  const stats = useMemo(() => ({
    total: state.workOrders.length,
    new: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.new).length,
    inProgress: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.inProgress).length,
    resolved: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.resolved).length,
  }), [state.workOrders])
  const visibleWorkOrders = useMemo(() => {
    const createdBounds = getDatePeriodBounds(createdPeriod, createdAnchorDate)
    const filtered = state.workOrders.filter((workOrder) => {
    const needle = search.trim().toLocaleLowerCase()
    const matchesSearch = !needle || [workOrder.workOrderNumber, workOrder.workOrderName, workOrder.issueDescription, workOrder.assignedToName ?? '']
      .some((value) => value.toLocaleLowerCase().includes(needle))
    const matchesStatus = statusFilter === 'all' || workOrder.status === Number(statusFilter)
    const matchesPriority = priorityFilter === 'all' || workOrder.priority === Number(priorityFilter)
    const matchesDepartment = departmentFilter === 'all' || workOrder.departmentId === departmentFilter
    const matchesCategory = categoryFilter === 'all' || workOrder.serviceCategoryId === categoryFilter
    const matchesChartLink = linkedWorkOrderIds === null || linkedWorkOrderIds.includes(workOrder.id)
    const createdTime = new Date(workOrder.createTime).getTime()
    const matchesCreated = !createdBounds || (createdTime >= createdBounds.start && createdTime < createdBounds.end)
    const isOverdue = Boolean(workOrder.expectedCompletionTime && ACTIVE_STATUSES.includes(workOrder.status)
      && new Date(workOrder.expectedCompletionTime).getTime() < Date.now())
    return matchesSearch && matchesStatus && matchesPriority && matchesDepartment && matchesCategory && matchesChartLink
      && matchesCreated && (!overdueOnly || isOverdue)
    })
    const activeSort = sort[0]
    if (!activeSort) return filtered
    return filtered.sort((left, right) => {
      const leftValue = left[activeSort.field as keyof WorkOrder]
      const rightValue = right[activeSort.field as keyof WorkOrder]
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'zh-CN', { numeric: true, sensitivity: 'base' })
      return activeSort.direction === 'asc' ? comparison : -comparison
    })
  }, [state.workOrders, search, statusFilter, priorityFilter, departmentFilter, categoryFilter, createdPeriod, createdAnchorDate, overdueOnly, linkedWorkOrderIds, sort])
  const pageCount = Math.max(1, Math.ceil(visibleWorkOrders.length / pageSize))
  const pageRows = visibleWorkOrders.slice((page - 1) * pageSize, page * pageSize)
  const recentActivity = [...state.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 4)
  const filterDefinitions: FilterDefinition[] = [
    { key: 'status', label: '状态', type: 'select', options: [{ value: 'all', label: '全部状态' }, ...workOrderStatusOptions.map((item) => ({ value: String(item.value), label: item.label }))] },
    { key: 'priority', label: '优先级', type: 'select', options: [{ value: 'all', label: '全部优先级' }, ...priorityOptions.map((item) => ({ value: String(item.value), label: item.label }))] },
    { key: 'department', label: '部门', type: 'select', options: [{ value: 'all', label: '全部部门' }, ...(state.departments ?? []).map((item) => ({ value: item.id, label: item.departmentName }))] },
    { key: 'category', label: '类别', type: 'select', options: [{ value: 'all', label: '全部类别' }, ...(state.serviceCategories ?? []).map((item) => ({ value: item.id, label: item.serviceCategoryName }))] },
    { key: 'created', label: '创建日期', type: 'datePeriod' },
  ]
  const filterValues: FilterValues = { status: statusFilter, priority: priorityFilter, department: departmentFilter, category: categoryFilter, created: { period: createdPeriod, anchorDate: createdAnchorDate } }
  const selectedWorkOrders = useMemo(() => state.workOrders.filter((workOrder) => selectedWorkOrderKeys.includes(workOrder.id)), [state.workOrders, selectedWorkOrderKeys])
  const assignmentCandidates = useMemo(() => pendingAssignment ? [pendingAssignment.workOrder] : selectedWorkOrders, [pendingAssignment, selectedWorkOrders])
  const batchEligibleEmployees = (state.employees ?? []).filter((employee) => employee.isActive && employee.isAvailableForOrder)
  const batchActions: BulkAction[] = [
    { id: 'assign', label: '批量调整负责人', icon: '↗' },
    { id: 'priority', label: '修改优先级', icon: '↑' },
    { id: 'status', label: '修改状态', icon: '◷' },
    { id: 'cancel', label: '取消工单', icon: '×' },
  ]

  useEffect(() => { setPage((current) => Math.min(current, pageCount)) }, [pageCount])

  const openDialog = (mode: DialogMode) => {
    setDialogError(null)
    setDialog(mode)
  }

  const runMutation = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true)
    setDialogError(null)
    try {
      await action()
      setNotice({ kind: 'success', message: successMessage })
      setDialog(null)
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : '操作失败，请重新读取后确认数据。'
      const partial = message.includes('工单主记录已更新') || message.includes('工单已创建，但')
      setNotice({ kind: 'error', message })
      if (partial) {
        setDialog(null)
        setRefreshToken((value) => value + 1)
      } else {
        setDialogError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const submitResourceEdit = async (input: ResourceEditValues) => {
    setBusy(true)
    setDialogError(null)
    try {
      if (input.type === 'employee') await updateDataverseEmployee(input.id, input.values)
      if (input.type === 'department') await updateDataverseDepartment(input.id, input.values)
      if (input.type === 'category') await updateDataverseServiceCategory(input.id, input.values)
      const resourceName = input.type === 'employee' ? '员工' : input.type === 'department' ? '部门' : '服务类别'
      setResourceEditor(null)
      setNotice({ kind: 'success', message: `${resourceName}信息已保存` })
      setRefreshToken((value) => value + 1)
    } catch (editError) {
      const message = editError instanceof Error ? editError.message : '资源更新失败，请确认数据后重试。'
      setDialogError(message)
    } finally {
      setBusy(false)
    }
  }

  const seedTestData = async () => {
    setBusy(true)
    setNotice(null)
    setSeedPhase('checking')
    try {
      const counts = await seedDataverseITTestData(setSeedPhase)
      setNotice({
        kind: 'success',
        message: `IT 演练数据已写入当前 Dataverse：新增部门 ${counts.departments}、员工 ${counts.employees}、服务类别 ${counts.serviceCategories}、工单 ${counts.workOrders}、派发记录 ${counts.assignments}、历史记录 ${counts.histories}。已存在的演练记录已保留。`,
      })
      setSeedDialogOpen(false)
    } catch (seedError) {
      setNotice({ kind: 'error', message: seedError instanceof Error ? seedError.message : '演练数据写入失败。' })
    } finally {
      setSeedPhase(null)
      setBusy(false)
      setRefreshToken((value) => value + 1)
    }
  }

  const submitWorkOrder = (input: Parameters<typeof createDataverseWorkOrder>[0]) => {
    if (selectedWorkOrder && dialog === 'edit') {
      const department = activeDepartments.find((item) => item.id === input.departmentId)
      const category = activeCategories.find((item) => item.id === input.serviceCategoryId)
      return runMutation(
        () => updateDataverseWorkOrder(selectedWorkOrder, input, department?.departmentName ?? selectedWorkOrder.department, category?.serviceCategoryName ?? selectedWorkOrder.serviceCategoryLabel ?? ''),
        '工单已更新',
      )
    }
    const department = activeDepartments.find((item) => item.id === input.departmentId)
    const category = activeCategories.find((item) => item.id === input.serviceCategoryId)
    if (!department || !category) {
      setDialogError('请选择有效的部门和服务类别。')
      return Promise.resolve()
    }
    return runMutation(
      async () => { await createDataverseWorkOrder(input, department.departmentName, category.serviceCategoryName) },
      '工单已创建',
    )
  }

  const submitAssignment = (employeeId: string, note: string) => {
    if (!selectedWorkOrder) return Promise.resolve()
    const employee = (state.employees ?? []).find((item) => item.id === employeeId)
    if (!employee) {
      setDialogError('请选择有效员工。')
      return Promise.resolve()
    }
    return runMutation(
      () => assignDataverseWorkOrder(selectedWorkOrder, employee, state, note),
      selectedWorkOrder.assignedToId ? '工单已转派' : '工单已派发',
    )
  }

  const submitUnassign = (note: string) => selectedWorkOrder
    ? runMutation(() => unassignDataverseWorkOrder(selectedWorkOrder, note), '工单已撤派并返回待分派')
    : Promise.resolve()

  const submitStatus = (nextStatus: WorkOrderStatus, note: string) => selectedWorkOrder
    ? runMutation(() => transitionDataverseWorkOrder(selectedWorkOrder, nextStatus, note), `工单状态已更新为${STATUS_LABELS[nextStatus]}`)
    : Promise.resolve()

  const resetListFilters = () => {
    setSearchInput('')
    setSearch('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setDepartmentFilter('all')
    setCategoryFilter('all')
    setCreatedPeriod('all')
    setCreatedAnchorDate(localDateValue(new Date()))
    setOverdueOnly(false)
    setLinkedWorkOrderIds(null)
    setLinkedFilterLabel(null)
    setPage(1)
  }

  const clearFilters = resetListFilters

  const handleFilterChange = (values: FilterValues) => {
    const valueFor = (key: string) => typeof values[key] === 'string' ? values[key] as string : 'all'
    setStatusFilter(valueFor('status'))
    setPriorityFilter(valueFor('priority'))
    setDepartmentFilter(valueFor('department'))
    setCategoryFilter(valueFor('category'))
    const createdValue = values.created
    if (createdValue && typeof createdValue === 'object' && !Array.isArray(createdValue) && 'period' in createdValue) {
      setCreatedPeriod(createdValue.period)
      setCreatedAnchorDate(createdValue.anchorDate || localDateValue(new Date()))
    } else {
      setCreatedPeriod('all')
      setCreatedAnchorDate(localDateValue(new Date()))
    }
    setOverdueOnly(false)
    setPage(1)
  }

  const openLinkedWorkOrders = (workOrders: WorkOrder[], filterLabel: string) => {
    resetListFilters()
    setLinkedWorkOrderIds(workOrders.map((workOrder) => workOrder.id))
    setLinkedFilterLabel(filterLabel)
    setSelectedWorkOrderKeys([])
    setView('工单管理')
    setPage(1)
  }

  const requestBatchAction = (actionId: string) => {
    if (actionId === 'assign' || actionId === 'priority' || actionId === 'status' || actionId === 'cancel') {
      setPendingAssignment(null)
      setBulkAction(actionId)
    }
  }

  const requestDragAssignment = (workOrder: WorkOrder, employee: EmployeeOption) => {
    setSelectedWorkOrderKeys([])
    setPendingAssignment({ workOrder, employee })
    setBulkAction('assign')
  }

  const executeBatchAction = async (input: WorkOrderBatchActionInput) => {
    const targets = pendingAssignment ? [pendingAssignment.workOrder] : selectedWorkOrders
    setBusy(true)
    const results: Array<{ workOrder: WorkOrder; success: boolean; message: string }> = []
    let workloadState = state
    try {
      for (const workOrder of targets) {
        try {
          if (input.action === 'assign') {
            const employee = pendingAssignment?.employee ?? state.employees?.find((item) => item.id === input.employeeId)
            if (!employee) throw new Error('找不到有效的目标员工。')
            await assignDataverseWorkOrder(workOrder, employee, workloadState, input.note)
            const nextStatus = workOrder.status === WORK_ORDER_STATUS.new || workOrder.status === WORK_ORDER_STATUS.inProgress || workOrder.status === WORK_ORDER_STATUS.onHold
              ? WORK_ORDER_STATUS.assigned : workOrder.status
            workloadState = { ...workloadState, workOrders: workloadState.workOrders.map((item) => item.id === workOrder.id
              ? { ...item, assignedToId: employee.id, assignedToName: employee.employeeName, status: nextStatus }
              : item) }
          } else if (input.action === 'priority') {
            const category = state.serviceCategories?.find((item) => item.id === workOrder.serviceCategoryId)
            await updateDataverseWorkOrder(workOrder, {
              workOrderName: workOrder.workOrderName,
              issueDescription: workOrder.issueDescription,
              priority: input.priority ?? workOrder.priority,
              departmentId: workOrder.departmentId ?? '',
              serviceCategoryId: workOrder.serviceCategoryId ?? '',
              expectedCompletionTime: workOrder.expectedCompletionTime,
            }, workOrder.department, category?.serviceCategoryName ?? workOrder.serviceCategoryLabel ?? '')
          } else {
            const targetStatus = input.action === 'cancel' ? WORK_ORDER_STATUS.cancelled : input.status
            if (targetStatus === undefined) throw new Error('请选择目标状态。')
            await transitionDataverseWorkOrder(workOrder, targetStatus, input.note)
          }
          results.push({ workOrder, success: true, message: '操作成功' })
        } catch (itemError) {
          results.push({ workOrder, success: false, message: itemError instanceof Error ? itemError.message : '操作失败' })
        }
      }
    } finally {
      setBusy(false)
    }
    const succeeded = results.filter((item) => item.success).length
    setBulkResults(results)
    setNotice({ kind: results.some((item) => !item.success) ? 'error' : 'success', message: `批量操作完成：${succeeded} 项成功，${results.length - succeeded} 项失败。` })
    setBulkAction(null)
    setPendingAssignment(null)
    setSelectedWorkOrderKeys([])
    setRefreshToken((value) => value + 1)
  }

  const dismissBulkResults = () => setBulkResults(null)

  return <AppLayout sidebarCollapsed={sidebarCollapsed} onSidebarCollapseChange={setSidebarCollapsed}
    sidebar={<AppSidebar
      items={[{ id: 'workspace', label: '工作台', items: [
        { id: 'overview', path: 'overview', label: '概览', icon: '⌂' },
        { id: 'work-orders', path: 'work-orders', label: '工单管理', icon: '▣', badge: stats.total },
        { id: 'dispatch', path: 'dispatch', label: '派发看板', icon: '↗', badge: stats.new },
        { id: 'resources', path: 'resources', label: '资源目录', icon: '◉' },
      ] }]}
      activePath={view === '概览' ? 'overview' : view === '工单管理' ? 'work-orders' : view === '派发看板' ? 'dispatch' : 'resources'} collapsed={sidebarCollapsed}
      onNavigate={(path) => setView(path === 'resources' ? '资源目录' : path === 'dispatch' ? '派发看板' : path === 'work-orders' ? '工单管理' : '概览')}
      brand={<div className="brand-lockup"><div className="brand-mark"><span /><span /><span /><span /></div><div><strong>opsdesk</strong><small>OPERATIONS WORKBENCH</small></div></div>}
      workspace={<div className="workspace-switch"><div className="workspace-avatar">IT</div><div><span>工作区</span><strong>IT 服务运营</strong></div><span className="switch-caret">⌄</span></div>}
      footer={<div className="profile-card"><div className="profile-avatar">A</div><div><strong>Code Apps 用户</strong><span>Dataverse 当前身份</span></div></div>}
    />}
    header={<AppHeader breadcrumbs={<div className="breadcrumbs"><span>工作台</span><b>/</b><strong>{view}</strong></div>}
      actions={<div className="topbar-actions"><span className="environment-chip"><i />Dataverse</span><Avatar small name="A" /></div>} />}
  >
      <div className="demo-banner"><span className="demo-indicator">◉</span><span><strong>Dataverse 在线数据</strong> · 六张业务表通过 Code Apps 数据连接读取；工单操作遵循当前 Dataverse 权限。</span>
        <div className="demo-banner-actions">
          <button className="seed-data-trigger" type="button" onClick={() => setSeedDialogOpen(true)} disabled={loading || busy}>添加 IT 演练数据</button>
          <button type="button" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading || busy}>{loading ? '读取中…' : '重新读取'}</button>
        </div>
      </div>

      {!loading && state.readWarnings && state.readWarnings.length > 0 && <div className="dataverse-read-warning" role="status">
        <strong>部分辅助数据源读取失败：</strong> {state.readWarnings.join(' ')}
      </div>}
      {error && state.workOrders.length > 0 && <div className="dataverse-read-warning warning-error" role="alert"><strong>刷新失败：</strong> {error}</div>}
      {notice && <div className={`operation-notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
        <span>{notice.kind === 'success' ? '✓' : '!'}</span><p>{notice.message}</p><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}>×</button>
      </div>}
      {bulkResults && <section className="bulk-results" role="status" aria-label="批量操作结果">
        <header><div><strong>批量操作结果</strong><span>{bulkResults.filter((item) => item.success).length} 成功 · {bulkResults.filter((item) => !item.success).length} 失败</span></div>
          <button className="icon-button" type="button" aria-label="关闭批量操作结果" onClick={dismissBulkResults}>×</button></header>
        <ul>{bulkResults.map((result) => <li key={result.workOrder.id} className={result.success ? 'bulk-result-success' : 'bulk-result-failure'}>
          <strong>{result.workOrder.workOrderNumber || result.workOrder.workOrderName}</strong><span>{result.message}</span>
        </li>)}</ul>
      </section>}

      <PageContainer eyebrow="SERVICE OPERATIONS" title={view}
        description={view === '概览' ? '查看工单规模、SLA 风险、工程师负载与处理趋势。' : view === '工单管理' ? '管理工单字段、跨记录操作和业务历史。' : view === '派发看板' ? '按实时工作负载和接单状态安排工程师任务。' : '核对员工、部门与服务类别的当前 Dataverse 字段。'}
        actions={(view === '概览' || view === '工单管理') && <button className="button button-primary create-button" disabled={busy || activeDepartments.length === 0 || activeCategories.length === 0}
          title={activeDepartments.length === 0 || activeCategories.length === 0 ? '需要有效的部门和服务类别记录' : undefined}
          onClick={() => { setSelectedId(null); openDialog('create') }}><span className="plus-mark">＋</span>新建工单</button>}>
        <nav className="workbench-view-tabs" aria-label="工单工作区视图">
          {(['概览', '工单管理', '派发看板', '资源目录'] as const).map((item) => <button key={item} type="button" className={view === item ? 'view-tab view-tab-active' : 'view-tab'} aria-current={view === item ? 'page' : undefined} onClick={() => setView(item)}>
            <span>{item === '概览' ? '⌂' : item === '工单管理' ? '▤' : item === '派发看板' ? '↗' : '◉'}</span>{item}
            {item === '派发看板' && <small>{stats.new}</small>}
          </button>)}
        </nav>

        {view === '概览' && <WorkOrderOperationsDashboard loading={loading} error={error}
          onRetry={() => setRefreshToken((value) => value + 1)} workOrders={state.workOrders} employees={state.employees ?? []}
          departments={state.departments ?? []} serviceCategories={state.serviceCategories ?? []} onOpenWorkOrders={openLinkedWorkOrders} />}
        {view === '工单管理' && <>
          <section className="metrics-grid" aria-label="工单概览">
            <MetricCard label="全部工单" value={stats.total} detail="当前读取记录" tone="purple" />
            <MetricCard label="待分派" value={stats.new} detail="需要安排负责人" tone="amber" />
            <MetricCard label="处理中" value={stats.inProgress} detail="正在跟进" tone="blue" />
            <MetricCard label="已解决" value={stats.resolved} detail="等待确认或关闭" tone="green" />
          </section>

          <section className="activity-strip"><div className="activity-label"><span className="activity-icon">◷</span><div><strong>最近动态</strong><small>Dataverse 工单历史</small></div></div>
            {recentActivity.map((event) => {
              const workOrder = state.workOrders.find((item) => item.id === event.workOrderId)
              return <button className="activity-item" key={event.id} onClick={() => workOrder && setSelectedId(workOrder.id)}>
                <span className={`activity-dot dot-${event.kind}`} /><span><strong>{event.description}</strong><small>{workOrder?.workOrderNumber ?? '工单'} · {formatDate(event.occurredAt)}</small></span>
              </button>
            })}
            {!loading && !error && recentActivity.length === 0 && <span className="activity-empty">暂无已读取的工单历史</span>}
          </section>

          <section className="work-order-card work-order-list-card">
            <header className="list-header work-order-list-header"><div className="work-order-list-heading"><div className="list-title-row"><h2>工单队列</h2><span className="result-count">{visibleWorkOrders.length}</span></div><p>按当前已读取记录筛选；选择行可查看完整字段与流转历史</p></div>
              <div className="list-controls">
                <SearchInput value={searchInput} onChange={(value) => { setSearchInput(value); setPage(1) }} onSearch={setSearch} onClear={() => { setSearch(''); setPage(1) }}
                  placeholder="搜索编号、标题、描述或负责人" ariaLabel="搜索工单" />
                <FilterBar definitions={filterDefinitions} values={filterValues} onChange={handleFilterChange} onReset={clearFilters} resetLabel="清除筛选" />
              </div>
            </header>
            {linkedFilterLabel && linkedWorkOrderIds && <div className="overdue-filter-chip overview-link-chip"><span>概览联动：{linkedFilterLabel} · {linkedWorkOrderIds.length} 张</span><button type="button" onClick={() => { setLinkedWorkOrderIds(null); setLinkedFilterLabel(null); setPage(1) }}>清除联动</button></div>}
            {overdueOnly && <div className="overdue-filter-chip"><span>仅显示预计时间已逾期的活动工单</span><button type="button" onClick={() => setOverdueOnly(false)}>清除</button></div>}
            <BulkActionBar selectedCount={selectedWorkOrders.length} actions={batchActions} onAction={requestBatchAction} onClear={() => setSelectedWorkOrderKeys([])} busy={busy} />
            <DataTable data={pageRows} columns={workOrderColumns} rowKey={(workOrder) => workOrder.id} ariaLabel="工单列表"
              loading={loading} loadingLabel="正在通过 Code Apps 数据连接读取 Dataverse…"
              error={!loading && state.workOrders.length === 0 ? error : null} onRetry={() => setRefreshToken((value) => value + 1)}
              emptyTitle={state.workOrders.length === 0 ? '当前数据源没有工单' : '没有找到匹配的工单'}
              emptyDescription={state.workOrders.length === 0 ? '创建第一张工单或检查当前环境的数据记录。' : '更改筛选条件或搜索关键词。'}
              emptyAction={<button className="button button-quiet" type="button" onClick={state.workOrders.length === 0 ? () => { setSelectedId(null); openDialog('create') } : clearFilters}>
                {state.workOrders.length === 0 ? '新建工单' : '清除筛选'}
              </button>}
              selectedRowKeys={selectedWorkOrderKeys} onSelectionChange={setSelectedWorkOrderKeys}
              onRowClick={(workOrder) => setSelectedId(workOrder.id)} sort={sort} onSortChange={(nextSort) => { setSort(nextSort); setPage(1) }} />
            <footer className="table-footer work-order-table-footer"><span>显示 <strong>{visibleWorkOrders.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleWorkOrders.length)}</strong> / {visibleWorkOrders.length}</span>
              <Pagination page={page} pageSize={pageSize} total={visibleWorkOrders.length} loading={loading}
                pageSizeOptions={[10, 25, 50]} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
              <span className="demo-pagination">已读取 {state.workOrders.length} 条工单</span>
            </footer>
          </section>
        </>}
        {view === '派发看板' && <WorkOrderDispatchBoard workOrders={state.workOrders} employees={state.employees ?? []}
          onRequestAssignment={requestDragAssignment} onOpenWorkOrder={(workOrder) => setSelectedId(workOrder.id)} />}
        {view === '资源目录' && <ResourceDirectory state={state} tab={resourceTab} query={resourceSearch} loading={loading} onTabChange={setResourceTab}
          onQueryChange={setResourceSearch} onEditResource={(resource) => { setDialogError(null); setResourceEditor(resource) }} />}
      </PageContainer>

    {selectedWorkOrder && <WorkOrderDetail key={selectedWorkOrder.id} workOrder={selectedWorkOrder} state={state} disabled={busy}
      onClose={() => setSelectedId(null)} onEdit={() => openDialog('edit')} onAssign={() => openDialog('assign')}
      onUnassign={() => openDialog('unassign')} onChangeStatus={() => openDialog('status')} />}

    <WorkOrderFormDialog open={dialog === 'create' || dialog === 'edit'} workOrder={dialog === 'edit' ? selectedWorkOrder : null}
      departments={state.departments ?? []} categories={state.serviceCategories ?? []} busy={busy} error={dialogError}
      onClose={() => !busy && setDialog(null)} onSubmit={submitWorkOrder} />
    <AssignmentDialog open={dialog === 'assign'} workOrder={selectedWorkOrder} state={state} busy={busy} error={dialogError}
      onClose={() => !busy && setDialog(null)} onSubmit={submitAssignment} />
    <NoteDialog open={dialog === 'unassign'} title="撤销派发" subtitle={selectedWorkOrder?.workOrderNumber ?? ''} label="撤派原因"
      busy={busy} error={dialogError} onClose={() => !busy && setDialog(null)} onSubmit={submitUnassign} />
    <StatusDialog open={dialog === 'status'} workOrder={selectedWorkOrder} busy={busy} error={dialogError}
      onClose={() => !busy && setDialog(null)} onSubmit={submitStatus} />
    <WorkOrderBatchActionDialog open={bulkAction !== null} action={bulkAction} workOrders={assignmentCandidates}
      allWorkOrders={state.workOrders} employees={batchEligibleEmployees} busy={busy} error={null}
      lockedEmployee={pendingAssignment?.employee} onClose={() => { if (!busy) { setBulkAction(null); setPendingAssignment(null) } }} onSubmit={executeBatchAction} />
    <ResourceEditDialog resource={resourceEditor} employees={state.employees ?? []} departments={state.departments ?? []}
      busy={busy} error={dialogError} onClose={() => { if (!busy) { setResourceEditor(null); setDialogError(null) } }} onSubmit={submitResourceEdit} />

    {seedDialogOpen && <div className="modal-backdrop" role="presentation">
      <section ref={seedDialogRef} tabIndex={-1} className="modal-card seed-dataset-dialog" role="dialog" aria-modal="true" aria-labelledby="seed-data-title" aria-describedby="seed-data-description">
        <header className="modal-header"><div><h2 id="seed-data-title">写入 IT 服务演练数据</h2><p>数据将写入当前连接的真实 Dataverse 环境</p></div>
          <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" disabled={busy} onClick={() => setSeedDialogOpen(false)}>×</button>
        </header>
        <div className="modal-content seed-dataset-content">
          <p id="seed-data-description">用于测试派单、负载筛选、批量操作、SLA 逾期和运营分析。所有新建资源与工单均带有 <strong>[IT演练]</strong> 标记。</p>
          <dl className="seed-dataset-counts">
            <div><dt>部门</dt><dd>3</dd></div><div><dt>员工</dt><dd>8</dd></div><div><dt>服务类别</dt><dd>8</dd></div>
            <div><dt>工单</dt><dd>30</dd></div><div><dt>派发记录</dt><dd>18</dd></div><div><dt>历史记录</dt><dd>50</dd></div>
          </dl>
          <p>工单覆盖全部七种状态、四档优先级、逾期与未逾期 SLA；员工样例包含不可接单、负载容量和停用记录。</p>
          <p className="seed-dataset-warning">写入前会检查已存在的演练标记并跳过，不覆盖已有记录；部分写入失败时已成功创建的数据会保留，重新执行可继续补齐。应用不会自动删除这些真实记录。</p>
          {seedPhase && <p className="seed-dataset-progress" role="status">
            {seedPhase === 'checking' ? '正在读取并核对现有 Dataverse 记录…'
              : seedPhase === 'resources' ? '正在写入演练部门、员工和服务类别…'
                : seedPhase === 'work-orders' ? '正在写入 IT 服务工单…' : '正在补充派发记录和工单历史…'}
          </p>}
        </div>
        <footer className="modal-footer seed-dataset-actions">
          <button className="button button-quiet" type="button" disabled={busy} onClick={() => setSeedDialogOpen(false)}>取消</button>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void seedTestData()}>{busy ? '正在写入…' : '确认写入演练数据'}</button>
        </footer>
      </section>
    </div>}
  </AppLayout>
}
