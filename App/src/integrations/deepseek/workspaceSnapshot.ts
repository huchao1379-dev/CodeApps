import {
  PRIORITY,
  STATUS_LABELS,
  WORK_ORDER_STATUS,
  type EmployeeOption,
  type WorkOrder,
  type WorkOrderStatus,
} from '../../domains/work-orders/types/workOrder.types'

const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [
  WORK_ORDER_STATUS.assigned,
  WORK_ORDER_STATUS.inProgress,
  WORK_ORDER_STATUS.onHold,
]

const ACTIVE_STATUS_LABELS = new Set(['待分派', '已分派', '处理中', '挂起'])

export type EmployeeLoadSnapshot = {
  id: string
  name: string
  department: string
  availableForOrder: boolean
  currentLoad: number
  maxTaskLoad: number | null
  remainingCapacity: number | null
  idle: boolean
}

export type WorkspaceSnapshot = {
  generatedAt: string
  total: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  highOrCritical: number
  unassigned: number
  overdue: number
  sampleHighPriority: Array<{
    number: string
    name: string
    priority: string
    status: string
    assignee: string
  }>
  employees: EmployeeLoadSnapshot[]
  idleEmployees: EmployeeLoadSnapshot[]
}

function priorityLabel(priority: WorkOrder['priority']): string {
  if (priority === PRIORITY.critical) return '紧急'
  if (priority === PRIORITY.high) return '高'
  if (priority === PRIORITY.medium) return '普通'
  return '低'
}

function employeeLoad(employeeId: string, workOrders: WorkOrder[]): number {
  return workOrders.filter((workOrder) => (
    workOrder.assignedToId === employeeId
    && ACTIVE_STATUSES.includes(workOrder.status)
  )).length
}

export function buildWorkspaceSnapshot(
  workOrders: WorkOrder[],
  employees: EmployeeOption[] = [],
): WorkspaceSnapshot {
  const byStatus: Record<string, number> = {}
  const byPriority: Record<string, number> = {
    低: 0,
    普通: 0,
    高: 0,
    紧急: 0,
  }
  let unassigned = 0
  let overdue = 0
  const highItems: WorkspaceSnapshot['sampleHighPriority'] = []

  for (const workOrder of workOrders) {
    const status = STATUS_LABELS[workOrder.status] ?? String(workOrder.status)
    byStatus[status] = (byStatus[status] ?? 0) + 1
    const pLabel = priorityLabel(workOrder.priority)
    byPriority[pLabel] = (byPriority[pLabel] ?? 0) + 1
    if (!workOrder.assignedToId) unassigned += 1
    const isActive = ACTIVE_STATUS_LABELS.has(status)
    if (isActive && workOrder.expectedCompletionTime && new Date(workOrder.expectedCompletionTime).getTime() < Date.now()) {
      overdue += 1
    }
    if (workOrder.priority === PRIORITY.high || workOrder.priority === PRIORITY.critical) {
      highItems.push({
        number: workOrder.workOrderNumber,
        name: workOrder.workOrderName,
        priority: pLabel,
        status,
        assignee: workOrder.assignedToName ?? '未分派',
      })
    }
  }

  const employeeSnapshots: EmployeeLoadSnapshot[] = employees
    .filter((employee) => employee.isActive)
    .map((employee) => {
      const currentLoad = employeeLoad(employee.id, workOrders)
      const maxTaskLoad = employee.maxTaskLoad ?? null
      const remainingCapacity = maxTaskLoad == null ? null : Math.max(0, maxTaskLoad - currentLoad)
      const idle = employee.isAvailableForOrder && (maxTaskLoad == null ? currentLoad === 0 : currentLoad < maxTaskLoad)
      return {
        id: employee.id,
        name: employee.employeeName,
        department: employee.department ?? '未分配部门',
        availableForOrder: employee.isAvailableForOrder,
        currentLoad,
        maxTaskLoad,
        remainingCapacity,
        idle,
      }
    })

  return {
    generatedAt: new Date().toISOString(),
    total: workOrders.length,
    byStatus,
    byPriority,
    highOrCritical: highItems.length,
    unassigned,
    overdue,
    sampleHighPriority: highItems.slice(0, 12),
    employees: employeeSnapshots,
    idleEmployees: employeeSnapshots.filter((item) => item.idle),
  }
}

export function formatWorkspaceSnapshotForPrompt(snapshot: WorkspaceSnapshot): string {
  return [
    `快照时间：${snapshot.generatedAt}`,
    `工单总数：${snapshot.total}`,
    `按状态：${JSON.stringify(snapshot.byStatus)}`,
    `按优先级：${JSON.stringify(snapshot.byPriority)}`,
    `高+紧急合计：${snapshot.highOrCritical}`,
    `未分派：${snapshot.unassigned}`,
    `逾期（活跃状态）：${snapshot.overdue}`,
    `高/紧急样例（最多12条）：${JSON.stringify(snapshot.sampleHighPriority)}`,
    `员工负载（活跃工单=已分派/处理中/挂起）：${JSON.stringify(snapshot.employees)}`,
    `空闲/可接单员工：${JSON.stringify(snapshot.idleEmployees)}`,
    '空闲定义：isAvailableForOrder=true，且当前负载 < 最大负载（无最大负载时要求当前负载为 0）。',
  ].join('\n')
}
