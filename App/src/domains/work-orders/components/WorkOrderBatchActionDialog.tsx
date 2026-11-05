import { useEffect, useMemo, useState } from 'react'
import { getAvailableStatusTransitions, isStatusTransitionDefined, priorityOptions, workOrderStatusOptions } from '../config/workOrderChoices'
import { useOverlayFocus } from '../../../shared/components/overlays/useOverlayFocus'
import { PRIORITY, WORK_ORDER_STATUS, type EmployeeOption, type Priority, type WorkOrder, type WorkOrderStatus } from '../types/workOrder.types'

const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]

export type WorkOrderBatchAction = 'assign' | 'priority' | 'status' | 'cancel'

export interface WorkOrderBatchActionInput {
  action: WorkOrderBatchAction
  employeeId?: string
  priority?: Priority
  status?: WorkOrderStatus
  note: string
}

export interface WorkOrderBatchActionDialogProps {
  open: boolean
  action: WorkOrderBatchAction | null
  workOrders: WorkOrder[]
  allWorkOrders: WorkOrder[]
  employees: EmployeeOption[]
  busy: boolean
  error: string | null
  lockedEmployee?: EmployeeOption | null
  onClose: () => void
  onSubmit: (input: WorkOrderBatchActionInput) => Promise<void>
}

const ACTION_TITLES: Record<WorkOrderBatchAction, string> = {
  assign: '批量调整负责人',
  priority: '批量修改优先级',
  status: '批量修改状态',
  cancel: '批量取消工单',
}

export function WorkOrderBatchActionDialog({ open, action, workOrders, allWorkOrders, employees, busy, error, lockedEmployee, onClose, onSubmit }: WorkOrderBatchActionDialogProps) {
  const [employeeId, setEmployeeId] = useState('')
  const [priority, setPriority] = useState<Priority>(PRIORITY.medium)
  const [status, setStatus] = useState<WorkOrderStatus>(WORK_ORDER_STATUS.inProgress)
  const [note, setNote] = useState('')
  const statusOptions = useMemo(() => workOrderStatusOptions.filter((option) => option.value !== WORK_ORDER_STATUS.cancelled
    && workOrders.length > 0 && workOrders.every((workOrder) => getAvailableStatusTransitions(workOrder).includes(option.value))), [workOrders])

  useEffect(() => {
    if (!open) return
    setEmployeeId(lockedEmployee?.id ?? '')
    setPriority(PRIORITY.medium)
    setStatus(statusOptions[0]?.value ?? WORK_ORDER_STATUS.inProgress)
    setNote('')
  }, [open, action, lockedEmployee, statusOptions])

  const dialogRef = useOverlayFocus<HTMLElement>(open, onClose)
  if (!open || !action) return null
  const needsNote = action === 'cancel'
    || (action === 'status' && (status === WORK_ORDER_STATUS.resolved || status === WORK_ORDER_STATUS.onHold))
    || (action === 'assign' && workOrders.some((item) => item.assignedToId))
  const cancelBlockedCount = action === 'cancel'
    ? workOrders.filter((item) => !isStatusTransitionDefined(item.status, WORK_ORDER_STATUS.cancelled)).length
    : 0
  const resumeBlockedCount = action === 'status'
    ? workOrders.filter((item) => isStatusTransitionDefined(item.status, WORK_ORDER_STATUS.inProgress) && !item.assignedToId).length
    : 0
  const closeBlockedCount = action === 'status'
    ? workOrders.filter((item) => isStatusTransitionDefined(item.status, WORK_ORDER_STATUS.closed) && !item.resolution?.trim()).length
    : 0
  const selectedEmployee = lockedEmployee ?? employees.find((item) => item.id === employeeId)
  const currentLoad = selectedEmployee ? allWorkOrders.filter((item) => item.assignedToId === selectedEmployee.id && ACTIVE_STATUSES.includes(item.status)).length : 0
  const availableSlots = selectedEmployee?.maxTaskLoad == null ? Infinity : Math.max(0, selectedEmployee.maxTaskLoad - currentLoad)
  const additionalAssignments = selectedEmployee ? workOrders.filter((item) => item.assignedToId !== selectedEmployee.id).length : 0
  const alreadyAssignedCount = selectedEmployee ? workOrders.length - additionalAssignments : 0
  const assignmentBlocker = action === 'assign' && selectedEmployee && !selectedEmployee.isActive
    ? '该员工已停用，不能接收新工单。'
    : action === 'assign' && selectedEmployee && !selectedEmployee.isAvailableForOrder
      ? '该员工当前不可接单。'
      : action === 'assign' && additionalAssignments === 0 && alreadyAssignedCount > 0
        ? '所选工单已由该负责人处理，无需重复派发。'
        : action === 'assign' && additionalAssignments > 0 && availableSlots === 0
          ? '该员工已达到最大工作负载，无法继续分派。'
          : null
  const assignmentWarning = action === 'assign' && selectedEmployee && additionalAssignments > availableSlots
    ? `容量冲突：当前剩余 ${Number.isFinite(availableSlots) ? availableSlots : '不限'} 个名额，本次有 ${additionalAssignments} 张工单需要新增负载；超出容量的记录会逐条失败并显示结果。`
    : action === 'assign' && alreadyAssignedCount > 0
      ? `${alreadyAssignedCount} 张所选工单已由该负责人负责，重复派发会被逐条拒绝。`
      : null

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialogRef} tabIndex={-1} className="modal-card bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-action-title">
      <header className="modal-header"><div><h2 id="bulk-action-title">{ACTION_TITLES[action]}</h2><p>将对 {workOrders.length} 张工单逐条执行，失败项不会阻止其他记录。</p></div>
        <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" disabled={busy} onClick={onClose}>×</button>
      </header>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault()
        void onSubmit({ action, employeeId, priority, status, note: note.trim() })
      }}>
        <div className="modal-content">
          <div className="bulk-selected-summary"><strong>已选工单</strong><span>{workOrders.slice(0, 8).map((item) => item.workOrderNumber || item.workOrderName).join('、')}{workOrders.length > 8 ? ` 等 ${workOrders.length} 项` : ''}</span></div>
          {action === 'assign' && <label>新负责人<b>*</b>
            {lockedEmployee ? <div className="current-assignee"><span className="avatar avatar-small">{lockedEmployee.employeeName.slice(-1)}</span>{lockedEmployee.employeeName}</div>
              : <select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                <option value="">选择工程师</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeName} · {employee.department ?? '未设置部门'}</option>)}
              </select>}
          </label>}
          {action === 'priority' && <label>目标优先级<b>*</b><select value={priority} onChange={(event) => setPriority(Number(event.target.value) as Priority)}>
            {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>}
          {action === 'status' && (statusOptions.length > 0
            ? <label>目标状态<b>*</b><select value={status} onChange={(event) => setStatus(Number(event.target.value) as WorkOrderStatus)}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            : <p className="bulk-blocker" role="alert">所选工单没有共同的合法目标状态，请调整选择或逐条更新。{resumeBlockedCount > 0 ? ` ${resumeBlockedCount} 张重新处理前需要指定负责人。` : ''}{closeBlockedCount > 0 ? ` ${closeBlockedCount} 张关闭前需要有解决方案。` : ''}</p>)}
          {action === 'cancel' && <p className="bulk-command-note">取消工单属于终止操作；每条记录仍会经过状态规则校验，并保留取消及撤派历史。</p>}
          {cancelBlockedCount > 0 && <p className="bulk-warning" role="status">其中 {cancelBlockedCount} 张工单当前状态不允许取消；其他符合条件的记录会继续处理，并逐条反馈结果。</p>}
          {action === 'assign' && selectedEmployee && <p className="bulk-command-note">每条工单会分别校验员工启用状态、可接单状态和累计工作负载。</p>}
          {assignmentWarning && <p className="bulk-warning" role="status">{assignmentWarning}</p>}
          {assignmentBlocker && <p className="bulk-blocker" role="alert">{assignmentBlocker}</p>}
          {action !== 'priority' && <label>{action === 'cancel' ? '取消原因' : action === 'status' && status === WORK_ORDER_STATUS.resolved ? '解决方案' : action === 'status' && status === WORK_ORDER_STATUS.onHold ? '暂停原因' : '操作说明'}{needsNote && <b>*</b>}
            <input type="text" maxLength={100} required={needsNote} value={note} onChange={(event) => setNote(event.target.value)} placeholder="最多 100 个字符" />
          </label>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-footer"><button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className={action === 'cancel' ? 'button button-danger-quiet' : 'button button-primary'} type="submit" disabled={busy || Boolean(assignmentBlocker) || (action === 'assign' && !employeeId) || (action === 'status' && statusOptions.length === 0)}>
            {busy ? '正在逐条处理…' : `确认执行 ${workOrders.length} 项`}
          </button>
        </footer>
      </form>
    </section>
  </div>
}
