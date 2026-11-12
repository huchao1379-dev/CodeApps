import type { WorkOrder } from './workOrder.types'

export type ItServiceView = '概览' | '工单管理' | '派发看板' | '组织日历' | '资源目录' | '负责人申请' | '角色权限'
export type ResourceTab = 'employees' | 'departments' | 'categories'
export type WorkOrderDialogMode = 'create-choice' | 'create' | 'create-ai' | 'edit' | 'assign' | 'unassign' | 'status' | null

export type BulkResultItem = {
  workOrder: WorkOrder
  success: boolean
  partial?: boolean
  pendingApproval?: boolean
  message: string
}
