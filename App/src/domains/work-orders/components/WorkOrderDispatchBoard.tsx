import { useMemo, useState, type DragEvent } from 'react'
import { PRIORITY, PRIORITY_LABELS, STATUS_LABELS, WORK_ORDER_STATUS, type EmployeeOption, type WorkOrder, type WorkOrderStatus } from '../types/workOrder.types'
import { SearchInput, StatusBadge } from '../../../shared/components'

const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]
const PRIORITY_CLASS = { [PRIORITY.low]: 'low', [PRIORITY.medium]: 'medium', [PRIORITY.high]: 'high', [PRIORITY.critical]: 'critical' }

export interface WorkOrderDispatchBoardProps {
  workOrders: WorkOrder[]
  employees: EmployeeOption[]
  onRequestAssignment: (workOrder: WorkOrder, employee: EmployeeOption) => void
  onOpenWorkOrder: (workOrder: WorkOrder) => void
}

export function WorkOrderDispatchBoard({ workOrders, employees, onRequestAssignment, onOpenWorkOrder }: WorkOrderDispatchBoardProps) {
  const backlog = workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.new && !workOrder.assignedToId)
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.isActive), [employees])
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all')
  const [capacityFilter, setCapacityFilter] = useState<'all' | 'has-capacity' | 'full'>('all')

  const workloadFor = (employeeId: string) => workOrders.filter((workOrder) =>
    workOrder.assignedToId === employeeId && ACTIVE_STATUSES.includes(workOrder.status),
  ).length

  const departments = useMemo(() => {
    const options = new Map<string, string>()
    activeEmployees.forEach((employee) => options.set(employee.departmentId ?? 'unassigned', employee.department || '未设置部门'))
    return [...options].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }, [activeEmployees])
  const normalizedQuery = employeeQuery.trim().toLocaleLowerCase()
  const filteredEmployees = activeEmployees.filter((employee) => {
    const searchable = [employee.employeeName, employee.email ?? '', employee.department ?? '', employee.skills ?? '']
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    const matchesDepartment = departmentFilter === 'all'
      || (departmentFilter === 'unassigned' ? !employee.departmentId : employee.departmentId === departmentFilter)
    const matchesAvailability = availabilityFilter === 'all'
      || (availabilityFilter === 'available' ? employee.isAvailableForOrder : !employee.isAvailableForOrder)
    const workload = workloadFor(employee.id)
    const hasCapacity = employee.maxTaskLoad == null || workload < employee.maxTaskLoad
    const matchesCapacity = capacityFilter === 'all' || (capacityFilter === 'has-capacity' ? hasCapacity : !hasCapacity)
    return searchable && matchesDepartment && matchesAvailability && matchesCapacity
  })
  const hasFilters = Boolean(employeeQuery || departmentFilter !== 'all' || availabilityFilter !== 'all' || capacityFilter !== 'all')

  const clearEmployeeFilters = () => {
    setEmployeeQuery('')
    setDepartmentFilter('all')
    setAvailabilityFilter('all')
    setCapacityFilter('all')
  }

  const dropWorkOrder = (event: DragEvent<HTMLElement>, employee: EmployeeOption) => {
    event.preventDefault()
    const workOrder = backlog.find((item) => item.id === event.dataTransfer.getData('text/work-order-id'))
    if (workOrder) onRequestAssignment(workOrder, employee)
  }

  return <section className="dispatch-board" aria-label="拖拽式工单派发">
    <header className="feature-heading"><div><span className="feature-eyebrow">DISPATCH WORKBENCH</span><h2>拖拽式工单派发</h2>
      <p>将待分派工单拖到工程师列，检查可接单状态与容量后确认写入。</p></div>
      <div className="dispatch-backlog-count"><strong>{backlog.length}</strong><span>待分派工单</span></div>
    </header>
    <div className="dispatch-board-grid">
      <section className="dispatch-backlog" aria-label="待分派工单">
        <header><h3>待分配工单</h3><span>{backlog.length}</span></header>
        {backlog.length === 0 ? <p className="dispatch-empty">当前没有待分派工单</p> : <div className="dispatch-order-list">
          {backlog.map((workOrder) => <article className="dispatch-order-card" key={workOrder.id} draggable
            onDragStart={(event) => { event.dataTransfer.setData('text/work-order-id', workOrder.id); event.dataTransfer.effectAllowed = 'move' }}>
            <button className="dispatch-order-title" type="button" onClick={() => onOpenWorkOrder(workOrder)}>{workOrder.workOrderName}</button>
            <span className="dispatch-order-number">{workOrder.workOrderNumber || '编号待生成'}</span>
            <div className="dispatch-order-meta"><span>{workOrder.department || '未指定部门'}</span><span>{workOrder.serviceCategoryLabel ?? '未分类'}</span></div>
            <div className="dispatch-order-footer"><span className={`priority-label priority-${PRIORITY_CLASS[workOrder.priority]}`}>{PRIORITY_LABELS[workOrder.priority]}</span>
              <span className="drag-hint" aria-hidden="true">⠿ 拖动</span></div>
          </article>)}
        </div>}
      </section>

      <section className="engineer-panel" aria-label="工程师任务看板">
        <header className="engineer-panel-header">
          <div className="engineer-panel-title"><div><h3>工程师任务看板</h3><p>按人员条件筛选可见的工程师与当前负载</p></div>
            <span>{filteredEmployees.length} / {activeEmployees.length} 人</span></div>
          <div className="dispatch-filter-row">
            <SearchInput value={employeeQuery} onChange={setEmployeeQuery} placeholder="搜索姓名、技能或邮箱" ariaLabel="搜索工程师" />
            <label className="dispatch-filter-field"><span>部门</span><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="all">全部部门</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <label className="dispatch-filter-field"><span>接单状态</span><select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as typeof availabilityFilter)}>
              <option value="all">全部</option><option value="available">可接单</option><option value="unavailable">暂不可接单</option>
            </select></label>
            <label className="dispatch-filter-field"><span>工作负载</span><select value={capacityFilter} onChange={(event) => setCapacityFilter(event.target.value as typeof capacityFilter)}>
              <option value="all">全部负载</option><option value="has-capacity">有剩余容量</option><option value="full">已达上限</option>
            </select></label>
            <button className="dispatch-filter-reset" type="button" disabled={!hasFilters} onClick={clearEmployeeFilters}>清除筛选</button>
          </div>
        </header>
        {activeEmployees.length === 0
          ? <div className="dispatch-empty">没有已启用的工程师记录</div>
          : filteredEmployees.length === 0
            ? <div className="dispatch-empty">没有符合条件的工程师<button type="button" onClick={clearEmployeeFilters}>清除筛选</button></div>
            : <div className="engineer-board" aria-label="筛选后的工程师任务看板">{filteredEmployees.map((employee) => {
          const workload = workloadFor(employee.id)
          const capacity = employee.maxTaskLoad
          const overloaded = capacity != null && workload >= capacity
          const unavailable = !employee.isAvailableForOrder
          const droppedEmployee = { ...employee }
          return <section className={`engineer-lane${overloaded ? ' lane-overloaded' : ''}${unavailable ? ' lane-unavailable' : ''}`} key={employee.id}
            onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropWorkOrder(event, droppedEmployee)}>
            <header className="engineer-lane-header"><span className="engineer-avatar">{employee.employeeName.slice(-1)}</span>
              <span className="engineer-identity"><strong>{employee.employeeName}</strong><small>{employee.department ?? '未设置部门'}</small></span>
              <StatusBadge status={unavailable ? 'unavailable' : 'available'} label={unavailable ? '暂不可接单' : '可接单'} size="small" />
            </header>
            <div className="workload-summary"><span>活动工单</span><strong>{workload}<small> / {capacity ?? '∞'}</small></strong></div>
            <div className="workload-track"><span style={{ width: capacity ? `${Math.min(100, workload / capacity * 100)}%` : workload > 0 ? '25%' : '0%' }} /></div>
            {overloaded && <p className="capacity-conflict">已达到工作负载上限</p>}
            {unavailable && <p className="capacity-conflict">此员工当前不能接收新工单</p>}
            <div className="engineer-lane-dropzone" aria-label={`将工单拖到${employee.employeeName}`}>
              {workOrders.filter((workOrder) => workOrder.assignedToId === employee.id && ACTIVE_STATUSES.includes(workOrder.status)).map((workOrder) =>
                <button key={workOrder.id} className="engineer-task" type="button" onClick={() => onOpenWorkOrder(workOrder)}>
                  <strong>{workOrder.workOrderName}</strong><span>{workOrder.workOrderNumber} · {STATUS_LABELS[workOrder.status]}</span>
                </button>,
              )}
              <span className="dropzone-hint">拖放待分派工单到此处</span>
            </div>
          </section>
        })}</div>}
      </section>
    </div>
  </section>
}
