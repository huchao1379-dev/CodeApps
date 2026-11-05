export const WORK_ORDER_STATUS = {
  new: 326990000,
  assigned: 326990001,
  inProgress: 326990002,
  onHold: 326990003,
  resolved: 326990004,
  closed: 326990005,
  cancelled: 326990006,
} as const

export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS]

export const PRIORITY = {
  low: 326990000,
  medium: 326990001,
  high: 326990002,
  critical: 326990003,
} as const

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY]
export type AssignmentKind = 'initial' | 'reassignment' | 'unassignment'
export type WorkOrderEventKind = 'created' | 'status-change' | 'assignment-change' | 'updated'

export interface WorkOrder {
  id: string
  workOrderNumber: string
  workOrderName: string
  issueDescription: string
  priority: Priority
  status: WorkOrderStatus
  assignedToId: string | null
  assignedToName: string | null
  departmentId?: string | null
  department: string
  serviceCategoryId?: string | null
  serviceCategoryLabel: string | null
  createTime: string
  expectedCompletionTime: string | null
  resolution: string | null
  resolvedAt: string | null
  closedAt: string | null
  createdBy?: string | null
  modifiedAt?: string | null
}

export interface EmployeeOption {
  id: string
  employeeName: string
  email?: string | null
  departmentId?: string | null
  department?: string | null
  gender?: string | null
  genderValue?: number | null
  age?: number | null
  hireDate?: string | null
  isActive: boolean
  isAvailableForOrder: boolean
  maxTaskLoad?: number | null
  skills?: string | null
}

export interface DepartmentOption {
  id: string
  departmentCode: string
  departmentName: string
  description: string | null
  establishedDate: string | null
  managerId: string | null
  managerName: string | null
  isActive: boolean
}

export interface ServiceCategoryOption {
  id: string
  categoryCode: string
  serviceCategoryName: string
  description: string | null
  defaultPriority: Priority | null
  defaultDepartmentId: string | null
  defaultDepartmentName: string | null
  isActive: boolean
}

export interface AssignmentEvent {
  id: string
  assignmentNumber?: string
  workOrderId: string
  assignedFromId: string | null
  assignedFromName: string | null
  assignedToId: string | null
  assignedToName: string | null
  assignedAt: string
  assignmentType: AssignmentKind
  assignmentTypeLabel?: string
  assignmentNote: string
  assignmentSource?: string
  assignmentSourceLabel?: string
  createdBy?: string | null
}

export interface WorkOrderEvent {
  id: string
  historyNumber?: string
  workOrderId: string
  kind: WorkOrderEventKind
  historyTypeLabel?: string
  occurredAt: string
  previousStatus?: WorkOrderStatus | null
  newStatus?: WorkOrderStatus | null
  previousStatusLabel?: string | null
  newStatusLabel?: string | null
  historyStatusLabel?: string | null
  description: string
  remarks?: string | null
  createdBy?: string | null
}

export interface WorkOrderStoreState {
  workOrders: WorkOrder[]
  assignments: AssignmentEvent[]
  events: WorkOrderEvent[]
  employees?: EmployeeOption[]
  departments?: DepartmentOption[]
  serviceCategories?: ServiceCategoryOption[]
  readWarnings?: string[]
}

export interface WorkOrderInput {
  workOrderName: string
  issueDescription: string
  priority: Priority
  departmentId: string
  serviceCategoryId: string
  expectedCompletionTime: string | null
}

/** Kept for the isolated local-storage prototype; the Dataverse page uses WorkOrderInput. */
export interface CreateWorkOrderInput {
  workOrderName: string
  issueDescription: string
  priority: Priority
  department: string
  expectedCompletionTime: string | null
}

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  [WORK_ORDER_STATUS.new]: '待分派',
  [WORK_ORDER_STATUS.assigned]: '已分派',
  [WORK_ORDER_STATUS.inProgress]: '处理中',
  [WORK_ORDER_STATUS.onHold]: '等待中',
  [WORK_ORDER_STATUS.resolved]: '已解决',
  [WORK_ORDER_STATUS.closed]: '已关闭',
  [WORK_ORDER_STATUS.cancelled]: '已取消',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  [PRIORITY.low]: '低',
  [PRIORITY.medium]: '普通',
  [PRIORITY.high]: '高',
  [PRIORITY.critical]: '紧急',
}
