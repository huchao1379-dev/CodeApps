import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react'
import { PRIORITY, PRIORITY_LABELS, STATUS_LABELS, WORK_ORDER_STATUS, type EmployeeOption, type WorkOrder, type WorkOrderStatus } from '../types/workOrder.types'
import { EmptyState, SearchInput, StatusBadge } from '../../../shared/components'

const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]
const PRIORITY_CLASS = { [PRIORITY.low]: 'low', [PRIORITY.medium]: 'medium', [PRIORITY.high]: 'high', [PRIORITY.critical]: 'critical' }

export interface WorkOrderDispatchBoardProps {
  workOrders: WorkOrder[]
  employees: EmployeeOption[]
  canAssign?: boolean
  onRequestAssignment: (workOrder: WorkOrder, employee: EmployeeOption) => void
  onOpenWorkOrder: (workOrder: WorkOrder) => void
}

export function WorkOrderDispatchBoard({
  workOrders,
  employees,
  canAssign = true,
  onRequestAssignment,
  onOpenWorkOrder,
}: WorkOrderDispatchBoardProps) {
  const backlog = workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.new && !workOrder.assignedToId)
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.isActive), [employees])
  const [selectedBacklogId, setSelectedBacklogId] = useState<string | null>(null)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [showAllPeople, setShowAllPeople] = useState(false)

  const assignedOrdersFor = (employeeId: string) => workOrders.filter((workOrder) =>
    workOrder.assignedToId === employeeId && ACTIVE_STATUSES.includes(workOrder.status),
  )
  const workloadFor = (employeeId: string) => assignedOrdersFor(employeeId).length
  const isOverloaded = (employee: EmployeeOption) => {
    const capacity = employee.maxTaskLoad
    return capacity != null && workloadFor(employee.id) >= capacity
  }
  const isAssignable = (employee: EmployeeOption) => employee.isAvailableForOrder && !isOverloaded(employee)

  const departments = useMemo(() => {
    const options = new Map<string, string>()
    activeEmployees.forEach((employee) => options.set(employee.departmentId ?? 'unassigned', employee.department || '未设置部门'))
    return [...options].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }, [activeEmployees])

  const normalizedQuery = employeeQuery.trim().toLocaleLowerCase()
  const matchingEmployees = activeEmployees.filter((employee) => {
    const searchable = [employee.employeeName, employee.email ?? '', employee.department ?? '', employee.skills ?? '']
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    const matchesDepartment = departmentFilter === 'all'
      || (departmentFilter === 'unassigned' ? !employee.departmentId : employee.departmentId === departmentFilter)
    return searchable && matchesDepartment
  })

  const hiddenPeopleCount = matchingEmployees.filter((employee) => !isAssignable(employee)).length
  const visibleEmployees = matchingEmployees.filter((employee) => showAllPeople || isAssignable(employee))
  const hasFilters = Boolean(employeeQuery || departmentFilter !== 'all')
  const selectedBacklog = backlog.find((item) => item.id === selectedBacklogId) ?? null

  useEffect(() => {
    if (selectedBacklogId && !backlog.some((item) => item.id === selectedBacklogId)) setSelectedBacklogId(null)
  }, [backlog, selectedBacklogId])

  const clearEmployeeFilters = () => {
    setEmployeeQuery('')
    setDepartmentFilter('all')
  }

  const dropWorkOrder = (event: DragEvent<HTMLElement>, employee: EmployeeOption) => {
    event.preventDefault()
    if (!canAssign || !isAssignable(employee)) return
    const workOrder = backlog.find((item) => item.id === event.dataTransfer.getData('text/work-order-id'))
    if (workOrder) onRequestAssignment(workOrder, employee)
  }

  const assignSelectedTo = (employee: EmployeeOption) => {
    if (!canAssign || !selectedBacklog || !isAssignable(employee)) return
    onRequestAssignment(selectedBacklog, employee)
  }

  const handleBacklogKeyDown = (event: KeyboardEvent<HTMLElement>, workOrder: WorkOrder, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const nextIndex = event.key === 'ArrowDown'
        ? Math.min(backlog.length - 1, index + 1)
        : Math.max(0, index - 1)
      const next = backlog[nextIndex]
      if (next) {
        setSelectedBacklogId(next.id)
        const target = event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-backlog-id="${next.id}"]`)
        target?.focus()
      }
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setSelectedBacklogId(workOrder.id)
    }
  }

  return <section className="dispatch-board" aria-label="工单派发看板">
    <header className="feature-heading"><div><span className="feature-eyebrow">DISPATCH WORKBENCH</span><h2>拖拽 / 点击派发</h2>
      <p>默认可派单区只显示可接单且未满负载的工程师；已分配工单可左右滑动查看。</p></div>
      <div className="dispatch-backlog-count"><strong>{backlog.length}</strong><span>待分派工单</span></div>
    </header>
    {selectedBacklog && <div className="dispatch-selection-chip" role="status">
      <span>已选中：{selectedBacklog.workOrderNumber || selectedBacklog.workOrderName}</span>
      <button type="button" onClick={() => setSelectedBacklogId(null)}>取消选择</button>
    </div>}
    <div className="dispatch-board-grid">
      <section className="dispatch-backlog" aria-label="待分派工单">
        <header><h3>待分配工单</h3><span>{backlog.length}</span></header>
        {backlog.length === 0 ? <EmptyState title="当前没有待分派工单" description="新建工单或将已有工单撤派后，会出现在这里等待分配。" icon="↗" /> : <div className="dispatch-order-list" role="listbox" aria-label="待分派工单列表">
          {backlog.map((workOrder, index) => {
            const selected = selectedBacklogId === workOrder.id
            return <article className={`dispatch-order-card${selected ? ' is-selected' : ''}`} key={workOrder.id} role="option" aria-selected={selected}
              data-backlog-id={workOrder.id} tabIndex={0} draggable
              onClick={() => setSelectedBacklogId(workOrder.id)}
              onKeyDown={(event) => handleBacklogKeyDown(event, workOrder, index)}
              onDragStart={(event) => {
                setSelectedBacklogId(workOrder.id)
                event.dataTransfer.setData('text/work-order-id', workOrder.id)
                event.dataTransfer.effectAllowed = 'move'
              }}>
              <button className="dispatch-order-title" type="button" onClick={(event) => { event.stopPropagation(); onOpenWorkOrder(workOrder) }}>{workOrder.workOrderName}</button>
              <span className="dispatch-order-number">{workOrder.workOrderNumber || '编号待生成'}</span>
              <div className="dispatch-order-meta"><span>{workOrder.department || '未指定部门'}</span><span>{workOrder.serviceCategoryLabel ?? '未分类'}</span></div>
              <div className="dispatch-order-footer"><span className={`priority-label priority-${PRIORITY_CLASS[workOrder.priority]}`}>{PRIORITY_LABELS[workOrder.priority]}</span>
                <span className="drag-hint" aria-hidden="true">{selected ? '已选中 · 可分配' : '点击选中 / 拖动'}</span></div>
            </article>
          })}
        </div>}
      </section>

      <section className="engineer-panel" aria-label="工程师任务看板">
        <header className="engineer-panel-header">
          <div className="engineer-panel-title"><div><h3>可派单工程师</h3>
            <p>{showAllPeople ? '已展开全部人员，含不可接单与已满负载' : '默认隐藏不可接单与已达工作上限的人员'}</p></div>
            <span>{visibleEmployees.length} / {matchingEmployees.length} 人</span></div>
          <div className="dispatch-filter-row">
            <SearchInput value={employeeQuery} onChange={setEmployeeQuery} placeholder="搜索姓名、技能或邮箱" ariaLabel="搜索工程师" />
            <label className="dispatch-filter-field"><span>部门</span><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="all">全部部门</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <button className="dispatch-filter-reset" type="button" disabled={!hasFilters} onClick={clearEmployeeFilters}>清除筛选</button>
            <button
              className={`button ${showAllPeople ? 'button-quiet' : 'button-primary'} dispatch-show-all-button`}
              type="button"
              aria-pressed={showAllPeople}
              onClick={() => setShowAllPeople((current) => !current)}
            >
              {showAllPeople ? '仅看可派单人员' : `查看所有人员${hiddenPeopleCount > 0 ? `（+${hiddenPeopleCount}）` : ''}`}
            </button>
          </div>
        </header>
        {activeEmployees.length === 0
          ? <EmptyState title="没有已启用的工程师" description="请先在资源目录中维护可接单员工。" icon="◉" />
          : visibleEmployees.length === 0
            ? <EmptyState
              title={matchingEmployees.length === 0 ? '没有符合条件的工程师' : '当前没有可派单人员'}
              description={matchingEmployees.length === 0
                ? '调整部门或搜索条件后再试。'
                : `有 ${hiddenPeopleCount} 人因不可接单或已达上限被隐藏，可点击「查看所有人员」展开。`}
              icon="⌕"
              action={matchingEmployees.length === 0
                ? <button className="button button-quiet" type="button" onClick={clearEmployeeFilters}>清除筛选</button>
                : <button className="button button-primary" type="button" onClick={() => setShowAllPeople(true)}>查看所有人员</button>}
            />
            : <div className="engineer-board" aria-label={showAllPeople ? '全部工程师任务看板' : '可派单工程师任务看板'}>{visibleEmployees.map((employee) => {
          const assignedOrders = assignedOrdersFor(employee.id)
          const workload = assignedOrders.length
          const capacity = employee.maxTaskLoad
          const overloaded = isOverloaded(employee)
          const unavailable = !employee.isAvailableForOrder
          const assignable = isAssignable(employee)
          const canClickAssign = canAssign && Boolean(selectedBacklog) && assignable
          return <section className={`engineer-lane${overloaded ? ' lane-overloaded' : ''}${unavailable ? ' lane-unavailable' : ''}${canClickAssign ? ' lane-assignable' : ''}`} key={employee.id}
            onDragOver={(event) => { if (canAssign && assignable) event.preventDefault() }} onDrop={(event) => dropWorkOrder(event, employee)}>
            <header className="engineer-lane-header"><span className="engineer-avatar">{employee.employeeName.slice(-1)}</span>
              <span className="engineer-identity"><strong>{employee.employeeName}</strong><small>{employee.department ?? '未设置部门'}</small></span>
              <StatusBadge status={unavailable ? 'unavailable' : overloaded ? 'overdue' : 'available'}
                label={unavailable ? '暂不可接单' : overloaded ? '已达上限' : '可接单'} size="small" />
            </header>
            <div className="workload-summary"><span>活动工单</span><strong>{workload}<small> / {capacity ?? '∞'}</small></strong></div>
            <div className="workload-track"><span style={{ width: capacity ? `${Math.min(100, workload / capacity * 100)}%` : workload > 0 ? '25%' : '0%' }} /></div>
            {overloaded && <p className="capacity-conflict">已达到工作负载上限</p>}
            {unavailable && <p className="capacity-conflict">此员工当前不能接收新工单</p>}
            {!canAssign && <p className="capacity-conflict">当前角色无派发权限</p>}
            <div className="engineer-lane-actions">
              <button className="button button-quiet dispatch-assign-button" type="button" disabled={!canClickAssign}
                title={!canAssign
                  ? '当前角色无派发权限'
                  : !selectedBacklog
                    ? '先在左侧选中一张待分派工单'
                    : unavailable
                      ? '该员工暂不可接单'
                      : overloaded
                        ? '已达负载上限'
                        : `分配给 ${employee.employeeName}`}
                onClick={() => assignSelectedTo(employee)}>
                {selectedBacklog ? `分配给 ${employee.employeeName}` : '先选中工单'}
              </button>
            </div>
            <div className={`engineer-lane-dropzone${canAssign && assignable ? '' : ' is-readonly'}`} aria-label={`${employee.employeeName}的已分配工单`}>
              {assignedOrders.length > 0 ? <div className="engineer-task-rail" role="list" aria-label={`${employee.employeeName}已分配工单，可左右滑动`}>
                {assignedOrders.map((workOrder) => <button key={workOrder.id} className="engineer-task" type="button" role="listitem" onClick={() => onOpenWorkOrder(workOrder)}>
                  <strong>{workOrder.workOrderName}</strong>
                  <span>{workOrder.workOrderNumber || '编号待生成'}</span>
                  <em>{STATUS_LABELS[workOrder.status]}</em>
                </button>)}
              </div> : <span className="dropzone-hint">
                {canAssign && assignable
                  ? (selectedBacklog ? '可点击上方分配，或拖放到此处' : '暂无活动工单 · 拖放待分派工单到此处')
                  : '暂无活动工单'}
              </span>}
            </div>
          </section>
        })}</div>}
      </section>
    </div>
  </section>
}
