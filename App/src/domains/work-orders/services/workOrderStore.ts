import {
  PRIORITY,
  STATUS_LABELS,
  WORK_ORDER_STATUS,
  type AssignmentEvent,
  type CreateWorkOrderInput,
  type EmployeeOption,
  type WorkOrder,
  type WorkOrderEvent,
  type WorkOrderStatus,
  type WorkOrderStoreState,
} from '../types/workOrder.types'
import { getStatusTransitionBlocker } from '../config/workOrderChoices'

const STORAGE_KEY = 'operations-workbench.work-orders.demo.v1'

export const demoEmployees: EmployeeOption[] = [
  { id: 'emp-001', employeeName: '林晨', department: 'IT 服务台', isActive: true, isAvailableForOrder: true },
  { id: 'emp-002', employeeName: '周宁', department: '基础架构', isActive: true, isAvailableForOrder: true },
  { id: 'emp-003', employeeName: '陈可', department: '终端支持', isActive: true, isAvailableForOrder: true },
]

const now = new Date()
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

const seedWorkOrders: WorkOrder[] = [
  {
    id: 'wo-001', workOrderNumber: 'DEMO-2026-001', workOrderName: '新员工无法登录邮箱',
    issueDescription: '新入职同事完成账号开通后仍无法登录 Outlook，请协助排查。', priority: PRIORITY.high,
    status: WORK_ORDER_STATUS.inProgress, assignedToId: 'emp-001', assignedToName: '林晨',
    department: 'IT 服务台', serviceCategoryLabel: '账号与权限', createTime: minutesAgo(190),
    expectedCompletionTime: null, resolution: null, resolvedAt: null, closedAt: null,
  },
  {
    id: 'wo-002', workOrderNumber: 'DEMO-2026-002', workOrderName: '会议室投屏设备无信号',
    issueDescription: '三楼会议室的无线投屏器可以连接，但显示屏没有画面。', priority: PRIORITY.critical,
    status: WORK_ORDER_STATUS.new, assignedToId: null, assignedToName: null,
    department: '终端支持', serviceCategoryLabel: '会议室设备', createTime: minutesAgo(36),
    expectedCompletionTime: null, resolution: null, resolvedAt: null, closedAt: null,
  },
  {
    id: 'wo-003', workOrderNumber: 'DEMO-2026-003', workOrderName: '财务共享盘访问申请',
    issueDescription: '申请加入财务项目共享盘，只需要读取权限。', priority: PRIORITY.medium,
    status: WORK_ORDER_STATUS.assigned, assignedToId: 'emp-003', assignedToName: '陈可',
    department: 'IT 服务台', serviceCategoryLabel: '账号与权限', createTime: minutesAgo(290),
    expectedCompletionTime: null, resolution: null, resolvedAt: null, closedAt: null,
  },
  {
    id: 'wo-004', workOrderNumber: 'DEMO-2026-004', workOrderName: 'VPN 连接间歇性中断',
    issueDescription: '出差员工反馈 VPN 每隔十几分钟会断开，需要重新登录。', priority: PRIORITY.high,
    status: WORK_ORDER_STATUS.onHold, assignedToId: 'emp-002', assignedToName: '周宁',
    department: '基础架构', serviceCategoryLabel: '网络与连接', createTime: minutesAgo(510),
    expectedCompletionTime: null, resolution: null, resolvedAt: null, closedAt: null,
  },
  {
    id: 'wo-005', workOrderNumber: 'DEMO-2026-005', workOrderName: '笔记本电脑风扇异响',
    issueDescription: '笔记本运行时风扇持续高转速并有异响。', priority: PRIORITY.low,
    status: WORK_ORDER_STATUS.resolved, assignedToId: 'emp-003', assignedToName: '陈可',
    department: '终端支持', serviceCategoryLabel: '终端设备', createTime: minutesAgo(1_200),
    expectedCompletionTime: null, resolution: '清理风扇积尘并完成压力测试，设备运行正常。',
    resolvedAt: minutesAgo(70), closedAt: null,
  },
  {
    id: 'wo-006', workOrderNumber: 'DEMO-2026-006', workOrderName: '安装开发工具链',
    issueDescription: '为新开发设备安装批准的运行时和命令行工具。', priority: PRIORITY.medium,
    status: WORK_ORDER_STATUS.closed, assignedToId: 'emp-001', assignedToName: '林晨',
    department: 'IT 服务台', serviceCategoryLabel: '软件安装', createTime: minutesAgo(2_800),
    expectedCompletionTime: null, resolution: '已按标准镜像安装并由申请人验证。',
    resolvedAt: minutesAgo(1_900), closedAt: minutesAgo(1_720),
  },
]

const seedAssignments: AssignmentEvent[] = [
  { id: 'as-001', workOrderId: 'wo-001', assignedFromId: null, assignedFromName: null, assignedToId: 'emp-001', assignedToName: '林晨', assignedAt: minutesAgo(170), assignmentType: 'initial', assignmentNote: '首次派发', assignmentSource: 'manual' },
  { id: 'as-002', workOrderId: 'wo-003', assignedFromId: null, assignedFromName: null, assignedToId: 'emp-003', assignedToName: '陈可', assignedAt: minutesAgo(250), assignmentType: 'initial', assignmentNote: '首次派发', assignmentSource: 'manual' },
  { id: 'as-003', workOrderId: 'wo-004', assignedFromId: null, assignedFromName: null, assignedToId: 'emp-002', assignedToName: '周宁', assignedAt: minutesAgo(450), assignmentType: 'initial', assignmentNote: '首次派发', assignmentSource: 'manual' },
  { id: 'as-004', workOrderId: 'wo-005', assignedFromId: null, assignedFromName: null, assignedToId: 'emp-003', assignedToName: '陈可', assignedAt: minutesAgo(1_100), assignmentType: 'initial', assignmentNote: '首次派发', assignmentSource: 'manual' },
  { id: 'as-005', workOrderId: 'wo-006', assignedFromId: null, assignedFromName: null, assignedToId: 'emp-001', assignedToName: '林晨', assignedAt: minutesAgo(2_700), assignmentType: 'initial', assignmentNote: '首次派发', assignmentSource: 'manual' },
]

const event = (
  id: string,
  workOrderId: string,
  kind: WorkOrderEvent['kind'],
  occurredAt: string,
  previousStatus: WorkOrderStatus | null,
  newStatus: WorkOrderStatus | null,
  description: string,
): WorkOrderEvent => ({ id, workOrderId, kind, occurredAt, previousStatus, newStatus, description })

const seedEvents: WorkOrderEvent[] = [
  event('ev-001', 'wo-001', 'created', minutesAgo(190), null, WORK_ORDER_STATUS.new, '工单已创建'),
  event('ev-002', 'wo-001', 'assignment-change', minutesAgo(170), WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, '派发给林晨'),
  event('ev-003', 'wo-001', 'status-change', minutesAgo(150), WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, '开始处理'),
  event('ev-004', 'wo-002', 'created', minutesAgo(36), null, WORK_ORDER_STATUS.new, '工单已创建'),
  event('ev-005', 'wo-003', 'created', minutesAgo(290), null, WORK_ORDER_STATUS.new, '工单已创建'),
  event('ev-006', 'wo-003', 'assignment-change', minutesAgo(250), WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, '派发给陈可'),
  event('ev-007', 'wo-004', 'created', minutesAgo(510), null, WORK_ORDER_STATUS.new, '工单已创建'),
  event('ev-008', 'wo-004', 'assignment-change', minutesAgo(450), WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, '派发给周宁'),
  event('ev-009', 'wo-004', 'status-change', minutesAgo(400), WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, '开始处理'),
  event('ev-010', 'wo-004', 'status-change', minutesAgo(340), WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold, '等待申请人提供复现日志'),
  event('ev-011', 'wo-005', 'created', minutesAgo(1_200), null, WORK_ORDER_STATUS.new, '工单已创建'),
  event('ev-012', 'wo-005', 'assignment-change', minutesAgo(1_100), WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, '派发给陈可'),
  event('ev-013', 'wo-005', 'status-change', minutesAgo(1_000), WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, '开始处理'),
  event('ev-014', 'wo-005', 'status-change', minutesAgo(70), WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.resolved, '问题已解决'),
  event('ev-015', 'wo-006', 'created', minutesAgo(2_800), null, WORK_ORDER_STATUS.new, '工单已创建'),
  event('ev-016', 'wo-006', 'assignment-change', minutesAgo(2_700), WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, '派发给林晨'),
  event('ev-017', 'wo-006', 'status-change', minutesAgo(2_500), WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, '开始处理'),
  event('ev-018', 'wo-006', 'status-change', minutesAgo(1_900), WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.resolved, '问题已解决'),
  event('ev-019', 'wo-006', 'status-change', minutesAgo(1_720), WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.closed, '工单已关闭'),
]

export const makeDemoState = (): WorkOrderStoreState => ({
  workOrders: seedWorkOrders,
  assignments: seedAssignments,
  events: seedEvents,
})

export function loadWorkOrderState(): WorkOrderStoreState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved) as WorkOrderStoreState
  } catch {
    // Ignore inaccessible or malformed local demo storage and restore the sample set.
  }
  return makeDemoState()
}

export function persistWorkOrderState(state: WorkOrderStoreState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The current in-memory session still works if browser storage is disabled.
  }
}

function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function appendEvent(
  events: WorkOrderEvent[],
  workOrderId: string,
  kind: WorkOrderEvent['kind'],
  previousStatus: WorkOrderStatus | null,
  newStatus: WorkOrderStatus | null,
  description: string,
  occurredAt = new Date().toISOString(),
): WorkOrderEvent[] {
  return [...events, { id: newId('ev'), workOrderId, kind, occurredAt, previousStatus, newStatus, description }]
}

export function createWorkOrder(state: WorkOrderStoreState, input: CreateWorkOrderInput): WorkOrderStoreState {
  const createdAt = new Date().toISOString()
  const year = new Date(createdAt).getFullYear()
  const sequence = state.workOrders.length + 1
  const workOrder: WorkOrder = {
    id: newId('wo'),
    workOrderNumber: `DEMO-${year}-${String(sequence).padStart(3, '0')}`,
    workOrderName: input.workOrderName.trim(),
    issueDescription: input.issueDescription.trim(),
    priority: input.priority,
    status: WORK_ORDER_STATUS.new,
    assignedToId: null,
    assignedToName: null,
    department: input.department.trim(),
    serviceCategoryLabel: null,
    createTime: createdAt,
    expectedCompletionTime: input.expectedCompletionTime || null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
  }
  return {
    ...state,
    workOrders: [workOrder, ...state.workOrders],
    events: appendEvent(state.events, workOrder.id, 'created', null, WORK_ORDER_STATUS.new, '工单已创建'),
  }
}

export function assignWorkOrder(
  state: WorkOrderStoreState,
  workOrderId: string,
  employee: EmployeeOption | null,
  note: string,
): WorkOrderStoreState {
  const current = state.workOrders.find((workOrder) => workOrder.id === workOrderId)
  if (!current) throw new Error('找不到这条工单。')
  if (([WORK_ORDER_STATUS.resolved, WORK_ORDER_STATUS.closed, WORK_ORDER_STATUS.cancelled] as readonly WorkOrderStatus[]).includes(current.status)) {
    throw new Error('已解决、已关闭或已取消的工单不能再派发。请先重新打开已解决工单。')
  }
  if (employee && (!employee.isActive || !employee.isAvailableForOrder)) {
    throw new Error('只能派发给在职且可接单的员工。')
  }
  if (employee?.id === current.assignedToId) throw new Error('该员工已经是当前负责人。')
  if (!employee && !current.assignedToId) throw new Error('当前工单没有负责人，无需撤派。')

  const assignedAt = new Date().toISOString()
  const kind = employee
    ? current.assignedToId ? 'reassignment' : 'initial'
    : 'unassignment'
  if (kind !== 'initial' && !note.trim()) {
    throw new Error(kind === 'reassignment' ? '转派时请填写转派原因。' : '撤派时请填写撤派原因。')
  }
  if (kind === 'unassignment' && current.status === WORK_ORDER_STATUS.inProgress) {
    throw new Error('处理中工单不能直接撤派；请转派给其他负责人，或先按授权规则处理。')
  }
  const nextStatus = employee
    ? current.status === WORK_ORDER_STATUS.new || current.status === WORK_ORDER_STATUS.inProgress
      ? WORK_ORDER_STATUS.assigned
      : current.status
    : WORK_ORDER_STATUS.new
  const statusChanged = nextStatus !== current.status
  const assignment: AssignmentEvent = {
    id: newId('as'), workOrderId,
    assignedFromId: current.assignedToId, assignedFromName: current.assignedToName,
    assignedToId: employee?.id ?? null, assignedToName: employee?.employeeName ?? null,
    assignedAt, assignmentType: kind, assignmentNote: note.trim(), assignmentSource: 'manual',
  }
  const actionText = kind === 'initial' ? `首次派发给${employee?.employeeName}`
    : kind === 'reassignment' ? `转派给${employee?.employeeName}` : '取消派发'
  let events = appendEvent(state.events, workOrderId, 'assignment-change', current.status, nextStatus, note.trim() ? `${actionText}：${note.trim()}` : actionText, assignedAt)
  if (statusChanged) {
    events = appendEvent(events, workOrderId, 'status-change', current.status, nextStatus, `状态更新为${STATUS_LABELS[nextStatus]}`, assignedAt)
  }
  return {
    ...state,
    assignments: [...state.assignments, assignment],
    events,
    workOrders: state.workOrders.map((workOrder) => workOrder.id !== workOrderId ? workOrder : {
      ...workOrder, assignedToId: employee?.id ?? null, assignedToName: employee?.employeeName ?? null,
      status: nextStatus,
    }),
  }
}

export function transitionWorkOrder(
  state: WorkOrderStoreState,
  workOrderId: string,
  nextStatus: WorkOrderStatus,
  note = '',
): WorkOrderStoreState {
  const current = state.workOrders.find((workOrder) => workOrder.id === workOrderId)
  if (!current) throw new Error('找不到这条工单。')
  const blocker = getStatusTransitionBlocker(current, nextStatus, note)
  if (blocker) throw new Error(blocker)

  const occurredAt = new Date().toISOString()
  const isReopened = current.status === WORK_ORDER_STATUS.resolved && nextStatus === WORK_ORDER_STATUS.inProgress
  const description = nextStatus === WORK_ORDER_STATUS.resolved ? `问题已解决：${note.trim()}`
    : nextStatus === WORK_ORDER_STATUS.cancelled ? `工单已取消：${note.trim()}`
      : isReopened ? `工单重新打开${current.resolution ? `；此前解决方案：${current.resolution}` : ''}`
      : note.trim() || `状态更新为${STATUS_LABELS[nextStatus]}`
  const updatedWorkOrder = {
    ...current,
    status: nextStatus,
    assignedToId: nextStatus === WORK_ORDER_STATUS.cancelled ? null : current.assignedToId,
    assignedToName: nextStatus === WORK_ORDER_STATUS.cancelled ? null : current.assignedToName,
    resolution: nextStatus === WORK_ORDER_STATUS.resolved ? note.trim() : isReopened ? null : current.resolution,
    resolvedAt: nextStatus === WORK_ORDER_STATUS.resolved ? occurredAt : isReopened ? null : current.resolvedAt,
    closedAt: nextStatus === WORK_ORDER_STATUS.closed ? occurredAt : current.closedAt,
  }
  let assignments = state.assignments
  let events = state.events
  if (nextStatus === WORK_ORDER_STATUS.cancelled && current.assignedToId) {
    assignments = [...assignments, {
      id: newId('as'), workOrderId,
      assignedFromId: current.assignedToId, assignedFromName: current.assignedToName,
      assignedToId: null, assignedToName: null,
      assignedAt: occurredAt, assignmentType: 'unassignment', assignmentNote: `工单取消：${note.trim()}`,
      assignmentSource: 'manual',
    }]
    events = appendEvent(events, workOrderId, 'assignment-change', current.status, current.status,
      `工单取消时撤派${current.assignedToName ? `（原负责人：${current.assignedToName}）` : ''}`, occurredAt)
  }
  return {
    ...state,
    assignments,
    workOrders: state.workOrders.map((workOrder) => workOrder.id === workOrderId ? updatedWorkOrder : workOrder),
    events: appendEvent(events, workOrderId, 'status-change', current.status, nextStatus, description, occurredAt),
  }
}

export function clearDemoState(): WorkOrderStoreState {
  return makeDemoState()
}
