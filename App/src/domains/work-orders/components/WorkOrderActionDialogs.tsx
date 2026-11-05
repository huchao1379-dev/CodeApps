import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { priorityOptions, workOrderStatusOptions, getAvailableStatusTransitions, isStatusTransitionDefined } from '../config/workOrderChoices'
import { useOverlayFocus } from '../../../shared/components/overlays/useOverlayFocus'
import {
  PRIORITY,
  STATUS_LABELS,
  WORK_ORDER_STATUS,
  type DepartmentOption,
  type EmployeeOption,
  type ServiceCategoryOption,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderStatus,
  type WorkOrderStoreState,
} from '../types/workOrder.types'

function toDateTimeInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function ModalShell({ title, subtitle, onClose, children }: {
  title: string
  subtitle: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useOverlayFocus<HTMLElement>(true, onClose)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section ref={dialogRef} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div>
        <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" onClick={onClose}>×</button>
      </header>
      {children}
    </section>
  </div>
}

export function WorkOrderFormDialog({
  open,
  workOrder,
  departments,
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  workOrder: WorkOrder | null
  departments: DepartmentOption[]
  categories: ServiceCategoryOption[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: WorkOrderInput) => void
}) {
  const [form, setForm] = useState({
    workOrderName: '',
    issueDescription: '',
    priority: PRIORITY.medium as WorkOrderInput['priority'],
    departmentId: '',
    serviceCategoryId: '',
    expectedCompletionTime: '',
  })
  const activeDepartments = useMemo(() => departments.filter((department) => department.isActive), [departments])
  const activeCategories = useMemo(() => categories.filter((category) => category.isActive), [categories])

  useEffect(() => {
    if (!open) return
    setForm({
      workOrderName: workOrder?.workOrderName ?? '',
      issueDescription: workOrder?.issueDescription ?? '',
      priority: workOrder?.priority ?? PRIORITY.medium,
      departmentId: workOrder?.departmentId ?? '',
      serviceCategoryId: workOrder?.serviceCategoryId ?? '',
      expectedCompletionTime: toDateTimeInput(workOrder?.expectedCompletionTime),
    })
  }, [open, workOrder])

  if (!open) return null
  const hasExistingInactiveDepartment = Boolean(workOrder?.departmentId && !activeDepartments.some((item) => item.id === workOrder.departmentId))
  const hasExistingInactiveCategory = Boolean(workOrder?.serviceCategoryId && !activeCategories.some((item) => item.id === workOrder.serviceCategoryId))

  return <ModalShell
    title={workOrder ? '编辑工单' : '新建工单'}
    subtitle={workOrder ? workOrder.workOrderNumber : '创建后进入待分派状态'}
    onClose={onClose}
  >
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      onSubmit({
        ...form,
        workOrderName: form.workOrderName.trim(),
        issueDescription: form.issueDescription.trim(),
        expectedCompletionTime: form.expectedCompletionTime ? new Date(form.expectedCompletionTime).toISOString() : null,
      })
    }}>
      <div className="modal-content">
        <label>工单标题<b>*</b><input required maxLength={850} value={form.workOrderName}
          onChange={(event) => setForm((current) => ({ ...current, workOrderName: event.target.value }))} /></label>
        <label>问题描述<input type="text" maxLength={100} value={form.issueDescription}
          onChange={(event) => setForm((current) => ({ ...current, issueDescription: event.target.value }))} /></label>
        <div className="form-row">
          <label>服务类别<b>*</b><select required value={form.serviceCategoryId} onChange={(event) => {
            const category = activeCategories.find((item) => item.id === event.target.value)
            const defaultDepartmentId = activeDepartments.some((item) => item.id === category?.defaultDepartmentId)
              ? category?.defaultDepartmentId
              : null
            setForm((current) => ({
              ...current,
              serviceCategoryId: event.target.value,
              ...(category?.defaultDepartmentId
                ? { departmentId: defaultDepartmentId ?? '' }
                : {}),
              ...(category?.defaultPriority ? { priority: category.defaultPriority } : {}),
            }))
          }}>
            <option value="">选择服务类别</option>
            {hasExistingInactiveCategory && <option value={workOrder?.serviceCategoryId}>已停用：{workOrder?.serviceCategoryLabel}</option>}
            {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.serviceCategoryName}</option>)}
          </select></label>
          <label>负责部门<b>*</b><select required value={form.departmentId}
            onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}>
            <option value="">选择负责部门</option>
            {hasExistingInactiveDepartment && <option value={workOrder?.departmentId}>已停用：{workOrder?.department}</option>}
            {activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.departmentName}</option>)}
          </select></label>
        </div>
        <div className="form-row">
          <label>优先级<b>*</b><select required value={form.priority} onChange={(event) => setForm((current) => ({
            ...current, priority: Number(event.target.value) as WorkOrderInput['priority'],
          }))}>{priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>预计完成时间<input type="datetime-local" value={form.expectedCompletionTime}
            onChange={(event) => setForm((current) => ({ ...current, expectedCompletionTime: event.target.value }))} /></label>
        </div>
        {(activeCategories.length === 0 || activeDepartments.length === 0) && <p className="form-error">没有可用的服务类别或部门，请检查对应 Dataverse 记录的 IsActive。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy || activeCategories.length === 0 || activeDepartments.length === 0}>{busy ? '保存中…' : '保存工单'}</button>
      </footer>
    </form>
  </ModalShell>
}

function getEmployeeLoad(employeeId: string, state: WorkOrderStoreState): number {
  return state.workOrders.filter((workOrder) => workOrder.assignedToId === employeeId
    && ([WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold] as readonly WorkOrderStatus[]).includes(workOrder.status)).length
}

export function AssignmentDialog({
  open,
  workOrder,
  state,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  workOrder: WorkOrder | null
  state: WorkOrderStoreState
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (employeeId: string, note: string) => void
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (open) {
      setEmployeeId('')
      setNote('')
    }
  }, [open, workOrder?.id])
  if (!open || !workOrder) return null

  const currentLoad = (employee: EmployeeOption) => getEmployeeLoad(employee.id, state)
  const eligible = (state.employees ?? []).filter((employee) => employee.isActive && employee.isAvailableForOrder)
  const isReassignment = Boolean(workOrder.assignedToId)
  const targetEmployee = eligible.find((employee) => employee.id === employeeId)
  const atCapacity = targetEmployee?.maxTaskLoad != null && currentLoad(targetEmployee) >= targetEmployee.maxTaskLoad

  return <ModalShell
    title={isReassignment ? '转派工单' : '派发工单'}
    subtitle={`${workOrder.workOrderNumber} · ${workOrder.workOrderName}`}
    onClose={onClose}
  >
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      onSubmit(employeeId, note.trim())
    }}>
      <div className="modal-content">
        <div className="current-assignee"><span>当前负责人</span><strong>{workOrder.assignedToName ?? '未分派'}</strong></div>
        <label>新负责人<b>*</b><select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">选择员工</option>
          {eligible.map((employee) => {
            const load = currentLoad(employee)
            const full = employee.maxTaskLoad != null && load >= employee.maxTaskLoad
            return <option key={employee.id} value={employee.id} disabled={full || employee.id === workOrder.assignedToId}>
              {employee.employeeName} · {employee.department ?? '未关联部门'} · {load}/{employee.maxTaskLoad ?? '∞'}{full ? ' · 已满载' : ''}
            </option>
          })}
        </select></label>
        <label>{isReassignment ? '转派原因' : '派发说明'}{isReassignment && <b>*</b>}<input type="text" maxLength={100} required={isReassignment} value={note}
          onChange={(event) => setNote(event.target.value)} /></label>
        {eligible.length === 0 && <p className="form-error">没有同时满足在职、可接单条件的员工。</p>}
        {atCapacity && <p className="form-error">该员工已达到最大工作负载。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy || eligible.length === 0 || !employeeId || atCapacity}>{busy ? '提交中…' : isReassignment ? '确认转派' : '确认派发'}</button>
      </footer>
    </form>
  </ModalShell>
}

export function NoteDialog({
  open,
  title,
  subtitle,
  label,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  subtitle: string
  label: string
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (note: string) => void
}) {
  const [note, setNote] = useState('')
  useEffect(() => { if (open) setNote('') }, [open])
  if (!open) return null
  return <ModalShell title={title} subtitle={subtitle} onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit(note.trim()) }}>
      <div className="modal-content">
        <label>{label}<b>*</b><input type="text" required maxLength={100} value={note}
          onChange={(event) => setNote(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? '提交中…' : '确认'}</button>
      </footer>
    </form>
  </ModalShell>
}

export function StatusDialog({
  open,
  workOrder,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  workOrder: WorkOrder | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (status: WorkOrderStatus, note: string) => void
}) {
  const [statusValue, setStatusValue] = useState('')
  const [note, setNote] = useState('')
  const options = useMemo(() => workOrder ? getAvailableStatusTransitions(workOrder) : [], [workOrder])
  const resumeRequiresAssignee = Boolean(workOrder && !workOrder.assignedToId
    && isStatusTransitionDefined(workOrder.status, WORK_ORDER_STATUS.inProgress))
  useEffect(() => {
    if (open && workOrder) {
      setStatusValue(String(options[0] ?? ''))
      setNote('')
    }
  }, [open, workOrder, options])
  if (!open || !workOrder) return null

  const nextStatus = Number(statusValue) as WorkOrderStatus
  const needsNote = ([WORK_ORDER_STATUS.onHold, WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.cancelled] as readonly WorkOrderStatus[]).includes(nextStatus)
  const label = nextStatus === WORK_ORDER_STATUS.resolved ? '解决方案'
    : nextStatus === WORK_ORDER_STATUS.onHold ? '暂停原因'
      : nextStatus === WORK_ORDER_STATUS.cancelled ? '取消原因'
        : '处理说明'
  const selectedLabel = workOrderStatusOptions.find((item) => item.value === nextStatus)?.label ?? STATUS_LABELS[nextStatus]

  return <ModalShell title="更新工单状态" subtitle={`${workOrder.workOrderNumber} · ${STATUS_LABELS[workOrder.status]}`} onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit(nextStatus, note.trim()) }}>
      <div className="modal-content">
        {options.length > 0
          ? <label>新状态<b>*</b><select required value={statusValue} onChange={(event) => setStatusValue(event.target.value)}>
            {options.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select></label>
          : <p className="form-error" role="status">当前工单没有可执行的目标状态。</p>}
        {resumeRequiresAssignee && <p className="bulk-warning" role="status">重新开始处理前，需要先为该工单指定负责人。</p>}
        {options.length > 0 && <label>{label}{needsNote && <b>*</b>}<input type="text" maxLength={100} required={needsNote} value={note}
          onChange={(event) => setNote(event.target.value)} /></label>}
        {nextStatus === WORK_ORDER_STATUS.closed && !workOrder.resolution?.trim() && <p className="form-error">关闭前需要先记录解决方案。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer"><button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy || options.length === 0 || (nextStatus === WORK_ORDER_STATUS.closed && !workOrder.resolution?.trim())}>
          {busy ? '提交中…' : `更新为${selectedLabel}`}
        </button>
      </footer>
    </form>
  </ModalShell>
}
