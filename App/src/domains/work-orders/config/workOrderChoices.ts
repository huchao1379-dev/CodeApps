import { PRIORITY, STATUS_LABELS, WORK_ORDER_STATUS } from '../types/workOrder.types'

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
