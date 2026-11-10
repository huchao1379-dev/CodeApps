import { WORK_ORDER_STATUS, type WorkOrderStatus, type WorkOrderStoreState } from '../types/workOrder.types'

export const WORK_ORDER_PAGE_SIZE = 10
export const BATCH_CONCURRENCY = 3

export const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [
  WORK_ORDER_STATUS.assigned,
  WORK_ORDER_STATUS.inProgress,
  WORK_ORDER_STATUS.onHold,
]

export const emptyWorkOrderState: WorkOrderStoreState = {
  workOrders: [],
  assignments: [],
  events: [],
  employees: [],
  departments: [],
  serviceCategories: [],
}
