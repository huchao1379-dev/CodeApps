import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { priorityOptions, workOrderStatusOptions, allowedTransitions } from '../config/workOrderChoices'
import {
  PRIORITY,
  PRIORITY_LABELS,
  STATUS_LABELS,
  WORK_ORDER_STATUS,
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
  AssignmentDialog,
  NoteDialog,
  StatusDialog,
  WorkOrderFormDialog,
} from '../components/WorkOrderActionDialogs'
import './WorkOrderWorkspacePage.css'

const emptyState: WorkOrderStoreState = {
  workOrders: [], assignments: [], events: [], employees: [], departments: [], serviceCategories: [],
}
const PAGE_SIZE = 25
type View = '工单管理' | '资源目录'
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

function StatusPill({ status }: { status: WorkOrderStatus }) {
  return <span className={`status-pill status-${statusClass[status]}`}><i />{STATUS_LABELS[status]}</span>
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

function handleRowKey(event: KeyboardEvent<HTMLTableRowElement>, open: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
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
  const canTransition = allowedTransitions[workOrder.status].some((status) => status !== WORK_ORDER_STATUS.new && status !== WORK_ORDER_STATUS.assigned)

  return <div className="detail-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="detail-panel" aria-label="工单详情">
      <header className="detail-header"><div><span className="eyebrow">工单详情</span><button className="icon-button detail-close" aria-label="关闭详情" onClick={onClose}>×</button></div>
        <span className="detail-number">{workOrder.workOrderNumber || '编号生成中'}</span>
      </header>
      <div className="detail-scroll">
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
      </div>
    </aside>
  </div>
}

function ResourceDirectory({ state, tab, query, onTabChange, onQueryChange }: {
  state: WorkOrderStoreState
  tab: ResourceTab
  query: string
  onTabChange: (tab: ResourceTab) => void
  onQueryChange: (query: string) => void
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

  return <section className="work-order-card resource-card">
    <header className="list-header"><div><div className="list-title-row"><h2>基础资源</h2><span className="result-count">{rows.length}</span></div><p>员工、部门与服务类别的 Dataverse 当前记录</p></div>
      <label className="search-control"><span>⌕</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索名称、编号或说明" /></label>
    </header>
    <div className="resource-tabs" role="tablist" aria-label="资源类型">
      <button role="tab" aria-selected={tab === 'employees'} className={tab === 'employees' ? 'resource-tab resource-tab-active' : 'resource-tab'} onClick={() => onTabChange('employees')}>员工 <span>{state.employees?.length ?? 0}</span></button>
      <button role="tab" aria-selected={tab === 'departments'} className={tab === 'departments' ? 'resource-tab resource-tab-active' : 'resource-tab'} onClick={() => onTabChange('departments')}>部门 <span>{state.departments?.length ?? 0}</span></button>
      <button role="tab" aria-selected={tab === 'categories'} className={tab === 'categories' ? 'resource-tab resource-tab-active' : 'resource-tab'} onClick={() => onTabChange('categories')}>服务类别 <span>{state.serviceCategories?.length ?? 0}</span></button>
    </div>
    <div className="table-scroll resource-scroll">
      {tab === 'employees' && <table className="work-order-table resource-table"><thead><tr><th>员工</th><th>部门</th><th>邮箱</th><th>性别</th><th>年龄</th><th>入职日期</th><th>接单状态</th><th>负载上限</th><th>技能</th></tr></thead>
        <tbody>{(rows as NonNullable<WorkOrderStoreState['employees']>).map((employee) => <tr key={employee.id}>
          <td><div className="assignee-cell"><Avatar small name={employee.employeeName} /><strong>{employee.employeeName}</strong></div></td>
          <td>{employee.department ?? '—'}</td><td>{employee.email ?? '—'}</td><td>{employee.gender ?? '—'}</td><td>{employee.age ?? '—'}</td>
          <td>{formatDate(employee.hireDate, true)}</td><td><span className={employee.isActive ? 'resource-state state-active' : 'resource-state state-inactive'}>{employee.isActive ? '在职' : '停用'}</span>
            <small className="availability-label">{employee.isAvailableForOrder ? '可接单' : '暂不可接单'}</small></td>
          <td>{employee.maxTaskLoad ?? '未设置'}</td><td className="resource-skills">{employee.skills ?? '—'}</td>
        </tr>)}</tbody></table>}
      {tab === 'departments' && <table className="work-order-table resource-table"><thead><tr><th>部门编号</th><th>部门名称</th><th>部门经理</th><th>说明</th><th>成立日期</th><th>状态</th></tr></thead>
        <tbody>{(rows as NonNullable<WorkOrderStoreState['departments']>).map((department) => <tr key={department.id}>
          <td>{department.departmentCode || '—'}</td><td><strong>{department.departmentName}</strong></td><td>{department.managerName ?? '—'}</td>
          <td>{department.description ?? '—'}</td><td>{formatDate(department.establishedDate, true)}</td>
          <td><span className={department.isActive ? 'resource-state state-active' : 'resource-state state-inactive'}>{department.isActive ? '启用' : '停用'}</span></td>
        </tr>)}</tbody></table>}
      {tab === 'categories' && <table className="work-order-table resource-table"><thead><tr><th>类别编号</th><th>服务类别</th><th>默认部门</th><th>默认优先级</th><th>说明</th><th>状态</th></tr></thead>
        <tbody>{(rows as NonNullable<WorkOrderStoreState['serviceCategories']>).map((category) => <tr key={category.id}>
          <td>{category.categoryCode || '—'}</td><td><strong>{category.serviceCategoryName}</strong></td><td>{category.defaultDepartmentName ?? '—'}</td>
          <td>{category.defaultPriority === null ? '—' : PRIORITY_LABELS[category.defaultPriority]}</td><td>{category.description ?? '—'}</td>
          <td><span className={category.isActive ? 'resource-state state-active' : 'resource-state state-inactive'}>{category.isActive ? '启用' : '停用'}</span></td>
        </tr>)}</tbody></table>}
    </div>
    {rows.length === 0 && <div className="resource-empty">{normalized ? '没有匹配的记录' : '该数据源当前没有可显示的记录'}</div>}
    <footer className="table-footer"><span>显示 <strong>{rows.length}</strong> 条</span><span className="demo-pagination">已读取所有可访问记录</span></footer>
  </section>
}

export default function WorkOrderWorkspacePage() {
  const [state, setState] = useState<WorkOrderStoreState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('工单管理')
  const [resourceTab, setResourceTab] = useState<ResourceTab>('employees')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [resourceSearch, setResourceSearch] = useState('')
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

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
  const activeEmployees = (state.employees ?? []).filter((employee) => employee.isActive && employee.isAvailableForOrder)
  const stats = useMemo(() => ({
    total: state.workOrders.length,
    new: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.new).length,
    inProgress: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.inProgress).length,
    resolved: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.resolved).length,
  }), [state.workOrders])
  const visibleWorkOrders = useMemo(() => state.workOrders.filter((workOrder) => {
    const needle = search.trim().toLocaleLowerCase()
    const matchesSearch = !needle || [workOrder.workOrderNumber, workOrder.workOrderName, workOrder.issueDescription, workOrder.assignedToName ?? '']
      .some((value) => value.toLocaleLowerCase().includes(needle))
    const matchesStatus = statusFilter === 'all' || workOrder.status === Number(statusFilter)
    const matchesPriority = priorityFilter === 'all' || workOrder.priority === Number(priorityFilter)
    const matchesDepartment = departmentFilter === 'all' || workOrder.departmentId === departmentFilter
    const matchesCategory = categoryFilter === 'all' || workOrder.serviceCategoryId === categoryFilter
    const matchesAssignee = assigneeFilter === 'all'
      || (assigneeFilter === 'unassigned' ? !workOrder.assignedToId : workOrder.assignedToId === assigneeFilter)
    return matchesSearch && matchesStatus && matchesPriority && matchesDepartment && matchesCategory && matchesAssignee
  }).sort((a, b) => b.createTime.localeCompare(a.createTime)), [
    state.workOrders, search, statusFilter, priorityFilter, departmentFilter, categoryFilter, assigneeFilter,
  ])
  const pageCount = Math.max(1, Math.ceil(visibleWorkOrders.length / PAGE_SIZE))
  const pageRows = visibleWorkOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const recentActivity = [...state.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 4)

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

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setDepartmentFilter('all')
    setCategoryFilter('all')
    setAssigneeFilter('all')
    setPage(1)
  }

  return <div className="workbench-shell">
    <aside className="app-sidebar">
      <div className="brand-lockup"><div className="brand-mark"><span /><span /><span /><span /></div><div><strong>opsdesk</strong><small>OPERATIONS WORKBENCH</small></div></div>
      <div className="workspace-switch"><div className="workspace-avatar">IT</div><div><span>工作区</span><strong>IT 服务运营</strong></div><span className="switch-caret">⌄</span></div>
      <nav className="primary-nav" aria-label="主导航"><span className="nav-caption">工作台</span>
        {(['工单管理', '资源目录'] as const).map((item, index) => <button key={item} className={`nav-item${view === item ? ' nav-active' : ''}`} onClick={() => setView(item)}>
          <span className="nav-glyph">{index === 0 ? '▣' : '◉'}</span>{item}{item === '工单管理' && <span className="nav-count">{stats.total}</span>}
        </button>)}
      </nav>
      <div className="sidebar-bottom"><span className="nav-caption">系统</span><div className="profile-card"><div className="profile-avatar">A</div><div><strong>Code Apps 用户</strong><span>Dataverse 当前身份</span></div></div></div>
    </aside>

    <main className="workspace-main">
      <header className="topbar"><div className="breadcrumbs"><span>工作台</span><b>/</b><strong>{view}</strong></div><div className="topbar-actions"><span className="environment-chip"><i />Dataverse</span><Avatar small name="A" /></div></header>
      <div className="demo-banner"><span className="demo-indicator">◉</span><span><strong>Dataverse 在线数据</strong> · 六张业务表通过 Code Apps 数据连接读取；工单操作遵循当前 Dataverse 权限。</span>
        <button onClick={() => setRefreshToken((value) => value + 1)} disabled={loading || busy}>{loading ? '读取中…' : '重新读取'}</button></div>

      {!loading && state.readWarnings && state.readWarnings.length > 0 && <div className="dataverse-read-warning" role="status">
        <strong>部分辅助数据源读取失败：</strong> {state.readWarnings.join(' ')}
      </div>}
      {error && state.workOrders.length > 0 && <div className="dataverse-read-warning warning-error" role="alert"><strong>刷新失败：</strong> {error}</div>}
      {notice && <div className={`operation-notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
        <span>{notice.kind === 'success' ? '✓' : '!'}</span><p>{notice.message}</p><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}>×</button>
      </div>}

      <div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">SERVICE OPERATIONS</span><h1>{view}</h1>
          <p>{view === '工单管理' ? '管理工单字段、派发过程、状态流转与业务历史。' : '核对员工、部门与服务类别的当前 Dataverse 字段。'}</p></div>
          {view === '工单管理' && <button className="button button-primary create-button" disabled={busy || activeDepartments.length === 0 || activeCategories.length === 0}
            title={activeDepartments.length === 0 || activeCategories.length === 0 ? '需要有效的部门和服务类别记录' : undefined}
            onClick={() => { setSelectedId(null); openDialog('create') }}><span className="plus-mark">＋</span>新建工单</button>}
        </div>

        {view === '工单管理' ? <>
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

          <section className="work-order-card">
            <header className="list-header work-order-list-header"><div className="work-order-list-heading"><div className="list-title-row"><h2>工单队列</h2><span className="result-count">{visibleWorkOrders.length}</span></div><p>按当前已读取记录筛选；选择行可查看完整字段与流转历史</p></div>
              <div className="list-controls">
                <label className="search-control"><span>⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="搜索编号、标题、描述或负责人" /></label>
                <label className="select-control"><span>状态</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="all">全部状态</option>{workOrderStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="select-control"><span>优先级</span><select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setPage(1) }}><option value="all">全部优先级</option>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="select-control"><span>部门</span><select value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1) }}><option value="all">全部部门</option>{(state.departments ?? []).map((item) => <option key={item.id} value={item.id}>{item.departmentName}</option>)}</select></label>
                <label className="select-control"><span>类别</span><select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1) }}><option value="all">全部类别</option>{(state.serviceCategories ?? []).map((item) => <option key={item.id} value={item.id}>{item.serviceCategoryName}</option>)}</select></label>
                <label className="select-control"><span>负责人</span><select value={assigneeFilter} onChange={(event) => { setAssigneeFilter(event.target.value); setPage(1) }}><option value="all">全部负责人</option><option value="unassigned">未分派</option>{(state.employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.employeeName}</option>)}</select></label>
              </div>
            </header>
            <div className="table-scroll"><table className="work-order-table"><thead><tr><th>工单</th><th>状态</th><th>优先级</th><th>服务类别</th><th>负责部门</th><th>负责人</th><th>预计完成</th><th>创建时间</th><th aria-label="打开详情" /></tr></thead>
              <tbody>{pageRows.map((workOrder) => <tr key={workOrder.id} onClick={() => setSelectedId(workOrder.id)} tabIndex={0} role="button"
                onKeyDown={(event) => handleRowKey(event, () => setSelectedId(workOrder.id))}>
                <td><div className="work-order-cell"><span className={`row-symbol symbol-${priorityClass[workOrder.priority]}`}>{workOrder.priority === PRIORITY.critical ? '!' : '•'}</span><span><strong>{workOrder.workOrderName}</strong><small>{workOrder.workOrderNumber || '编号待生成'}</small></span></div></td>
                <td><StatusPill status={workOrder.status} /></td><td><PriorityLabel priority={workOrder.priority} /></td>
                <td>{workOrder.serviceCategoryLabel ?? '—'}</td><td><span className="department-cell">{workOrder.department || '—'}</span></td>
                <td><div className="assignee-cell"><Avatar small name={workOrder.assignedToName ?? null} /><span>{workOrder.assignedToName ?? '待分派'}</span></div></td>
                <td><span className="date-cell">{formatDate(workOrder.expectedCompletionTime)}</span></td><td><span className="date-cell">{formatDate(workOrder.createTime)}</span></td>
                <td><span className="row-chevron">›</span></td>
              </tr>)}</tbody>
            </table></div>
            {loading && <div className="data-load-state">正在通过 Code Apps 数据连接读取 Dataverse…</div>}
            {!loading && error && state.workOrders.length === 0 && <div className="data-load-state data-load-error"><strong>Dataverse 工单读取失败</strong><p>{error}</p><button className="button button-quiet" onClick={() => setRefreshToken((value) => value + 1)}>重试</button></div>}
            {!loading && !error && visibleWorkOrders.length === 0 && <div className="empty-results"><span>⌕</span><strong>{state.workOrders.length === 0 ? '当前数据源没有工单' : '没有找到匹配的工单'}</strong><p>{state.workOrders.length === 0 ? '创建第一张工单或检查当前环境的数据记录。' : '更改筛选条件或搜索关键词。'}</p><button className="button button-quiet" onClick={clearFilters}>清除筛选</button></div>}
            <footer className="table-footer"><span>显示 <strong>{visibleWorkOrders.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleWorkOrders.length)}</strong> / {visibleWorkOrders.length}</span>
              <div className="pagination-controls"><button className="icon-button" aria-label="上一页" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button><span>第 {page} / {pageCount} 页</span>
                <button className="icon-button" aria-label="下一页" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button></div>
              <span className="demo-pagination">已读取 {state.workOrders.length} 条工单</span>
            </footer>
          </section>
          <footer className="page-footnote"><span>ⓘ</span>工作负载按当前已读取的 Assigned、In Progress、On Hold 工单计算。Dataverse SDK 当前无多表事务，部分写入失败会提示刷新核验。</footer>
        </> : <ResourceDirectory state={state} tab={resourceTab} query={resourceSearch} onTabChange={setResourceTab} onQueryChange={setResourceSearch} />}
      </div>
    </main>

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
  </div>
}
