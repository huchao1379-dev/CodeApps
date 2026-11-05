import { PRIORITY, STATUS_LABELS, WORK_ORDER_STATUS } from '../types/workOrder.types'
import type { WorkOrder, WorkOrderStatus } from '../types/workOrder.types'

/** Choice values confirmed against the currently generated Dataverse model. */
export const workOrderStatuses = [
  WORK_ORDER_STATUS.new,
  WORK_ORDER_STATUS.assigned,
  WORK_ORDER_STATUS.inProgress,
  WORK_ORDER_STATUS.onHold,
  WORK_ORDER_STATUS.resolved,
  WORK_ORDER_STATUS.closed,
  WORK_ORDER_STATUS.cancelled,
] as const

export const workOrderStatusOptions = workOrderStatuses.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}))

export const priorityOptions = [
  { value: PRIORITY.low, label: '低' },
  { value: PRIORITY.medium, label: '普通' },
  { value: PRIORITY.high, label: '高' },
  { value: PRIORITY.critical, label: '紧急' },
] as const

export const allowedTransitions: Record<number, readonly number[]> = {
  [WORK_ORDER_STATUS.new]: [WORK_ORDER_STATUS.cancelled],
  [WORK_ORDER_STATUS.assigned]: [WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.cancelled],
  [WORK_ORDER_STATUS.inProgress]: [WORK_ORDER_STATUS.onHold, WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.cancelled],
  [WORK_ORDER_STATUS.onHold]: [WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.cancelled],
  [WORK_ORDER_STATUS.resolved]: [WORK_ORDER_STATUS.closed, WORK_ORDER_STATUS.inProgress],
  [WORK_ORDER_STATUS.closed]: [],
  [WORK_ORDER_STATUS.cancelled]: [],
}

export function isStatusTransitionDefined(currentStatus: WorkOrderStatus, nextStatus: WorkOrderStatus): boolean {
  return allowedTransitions[currentStatus]?.includes(nextStatus) ?? false
}

export function getAvailableStatusTransitions(workOrder: WorkOrder): WorkOrderStatus[] {
  return workOrderStatuses.filter((nextStatus) => nextStatus !== WORK_ORDER_STATUS.new
    && nextStatus !== WORK_ORDER_STATUS.assigned
    && isStatusTransitionDefined(workOrder.status, nextStatus)
    && (nextStatus !== WORK_ORDER_STATUS.inProgress || Boolean(workOrder.assignedToId))
    && (nextStatus !== WORK_ORDER_STATUS.closed || Boolean(workOrder.resolution?.trim())))
}

export function getStatusTransitionBlocker(workOrder: WorkOrder, nextStatus: WorkOrderStatus, note: string): string | null {
  if (nextStatus === WORK_ORDER_STATUS.new || nextStatus === WORK_ORDER_STATUS.assigned) {
    return '待分派或已分派状态请通过撤派、派发或转派操作更新。'
  }
  if (!isStatusTransitionDefined(workOrder.status, nextStatus)) {
    return `不允许从“${STATUS_LABELS[workOrder.status]}”流转到“${STATUS_LABELS[nextStatus]}”。`
  }
  if (nextStatus === WORK_ORDER_STATUS.inProgress && !workOrder.assignedToId) {
    return '请先派发工单，再开始处理。'
  }
  if (nextStatus === WORK_ORDER_STATUS.onHold && !note.trim()) return '请填写暂停原因。'
  if (nextStatus === WORK_ORDER_STATUS.resolved && !note.trim()) return '请填写解决方案。'
  if (nextStatus === WORK_ORDER_STATUS.cancelled && !note.trim()) return '请填写取消原因。'
  if (note.length > 100) return '操作说明不能超过 100 个字符。'
  if (nextStatus === WORK_ORDER_STATUS.closed && !workOrder.resolution?.trim()) {
    return '请先记录解决方案，再关闭工单。'
  }
  return null
}
