import { Cr590_assignmentsService } from '../../../generated/services/Cr590_assignmentsService'
import { Cr590_tablesService } from '../../../generated/services/Cr590_tablesService'
import { Cr590_workordersService } from '../../../generated/services/Cr590_workordersService'
import type { Cr590_assignmentsBase } from '../../../generated/models/Cr590_assignmentsModel'
import {
  Cr590_assignmentscr590_assignmentsource,
  Cr590_assignmentscr590_assignmenttype,
} from '../../../generated/models/Cr590_assignmentsModel'
import type {
  Cr590_tablesBase,
  Cr590_tablescr590_historytype,
  Cr590_tablescr590_newstatus,
  Cr590_tablescr590_previousstatus,
  Cr590_tablescr590_status,
} from '../../../generated/models/Cr590_tablesModel'
import type { Cr590_workordersBase, Cr590_workorderscr590_status } from '../../../generated/models/Cr590_workordersModel'
import { getStatusTransitionBlocker } from '../config/workOrderChoices'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  WORK_ORDER_STATUS,
  type EmployeeOption,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderStatus,
  type WorkOrderStoreState,
} from '../types/workOrder.types'

const HISTORY_TYPE = {
  statusChange: 326990000,
  assignmentChange: 326990001,
  priorityChange: 326990002,
  departmentChange: 326990003,
  resolutionUpdate: 326990004,
  generalUpdate: 326990005,
  created: 326990006,
  cancelled: 326990007,
} as const satisfies Record<string, Cr590_tablescr590_historytype>

const ASSIGNMENT_TYPE = {
  initial: 326990000,
  reassignment: 326990001,
  unassignment: 326990002,
} as const satisfies Record<string, keyof typeof Cr590_assignmentscr590_assignmenttype>

const MANUAL_SOURCE: keyof typeof Cr590_assignmentscr590_assignmentsource = 326990000
const ACTIVE_STATUSES: readonly WorkOrderStatus[] = [WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]
const ENTITY_SETS = {
  employees: 'cr590_table2s',
  departments: 'cr590_table1s',
  serviceCategories: 'cr590_servicecategories',
  workOrders: 'cr590_workorders',
} as const

type WorkOrderPatch = Omit<
  Partial<Omit<Cr590_workordersBase, 'cr590_workorderid'>>,
  'cr590_AssignedTo@odata.bind' | 'cr590_expectedcompletiontime' | 'cr590_resolution' | 'cr590_resolvedat' | 'cr590_closedat'
> & {
  'cr590_AssignedTo@odata.bind'?: string | null
  cr590_expectedcompletiontime?: string | null
  cr590_resolution?: string | null
  cr590_resolvedat?: string | null
  cr590_closedat?: string | null
}

type HistoryInput = {
  workOrder: WorkOrder
  type: Cr590_tablescr590_historytype
  description: string
  remarks?: string
  occurredAt: string
  previousStatus?: WorkOrderStatus | null
  newStatus?: WorkOrderStatus | null
}

/** History has a separate four-value status choice, so preserve a coarse semantic value there. */
function historyStatus(status: WorkOrderStatus | null | undefined): Cr590_tablescr590_status | undefined {
  if (status === null || status === undefined) return undefined
  if (status === WORK_ORDER_STATUS.cancelled) return 326990003
  if (status === WORK_ORDER_STATUS.inProgress || status === WORK_ORDER_STATUS.onHold) return 326990001
  if (status === WORK_ORDER_STATUS.resolved || status === WORK_ORDER_STATUS.closed) return 326990002
  return 326990000
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return '运行时未提供错误详情'
}

export class PartialWorkOrderWriteError extends Error {
  constructor(stage: string, source: unknown, recordAction = '已更新') {
    super(`部分成功：工单主记录${recordAction}，但${stage}失败。页面将重新读取 Dataverse；请核对当前工单、派发记录和历史后再继续操作。原因：${errorMessage(source)}`)
    this.name = 'PartialWorkOrderWriteError'
  }
}

function unwrapWrite<T>(result: { success: boolean; data: T; error?: unknown }, source: string): T {
  if (!result.success) throw new Error(`Dataverse ${source} 写入失败：${errorMessage(result.error)}`)
  return result.data
}

async function updateWorkOrder(id: string, patch: WorkOrderPatch): Promise<void> {
  const changedFields = patch as unknown as Partial<Omit<Cr590_workordersBase, 'cr590_workorderid'>>
  unwrapWrite(await Cr590_workordersService.update(id, changedFields), 'WorkOrder')
}

async function createHistory({ workOrder, type, description, remarks, occurredAt, previousStatus, newStatus }: HistoryInput): Promise<void> {
  const mappedPreviousStatus = historyStatus(previousStatus)
  const mappedNewStatus = historyStatus(newStatus)
  const mappedStatus = historyStatus(newStatus ?? workOrder.status)
  const payload = {
    'cr590_WorkOrder@odata.bind': `/${ENTITY_SETS.workOrders}(${workOrder.id})`,
    cr590_historytype: type,
    cr590_changedat: occurredAt,
    cr590_changedescription: description.slice(0, 100),
    cr590_remarks: remarks?.slice(0, 100),
    ...(mappedPreviousStatus === undefined ? {} : { cr590_previousstatus: mappedPreviousStatus as Cr590_tablescr590_previousstatus }),
    ...(mappedNewStatus === undefined ? {} : { cr590_newstatus: mappedNewStatus as Cr590_tablescr590_newstatus }),
    ...(mappedStatus === undefined ? {} : { cr590_status: mappedStatus }),
    cr590_workordernumber: workOrder.workOrderNumber,
    statecode: 0,
  } as Omit<Cr590_tablesBase, 'cr590_tableid'>

  // HistoryNumber is an auto-number column generated by Dataverse despite being required in the generated TS model.
  unwrapWrite(await Cr590_tablesService.create(payload), 'WorkOrderHistory')
}

async function createAssignment({
  workOrder,
  assignedFromId,
  assignedToId,
  type,
  note,
  occurredAt,
}: {
  workOrder: WorkOrder
  assignedFromId: string | null
  assignedToId: string | null
  type: keyof typeof ASSIGNMENT_TYPE
  note: string
  occurredAt: string
}): Promise<void> {
  const payload = {
    'cr590_WorkOrder@odata.bind': `/${ENTITY_SETS.workOrders}(${workOrder.id})`,
    ...(assignedFromId ? { 'cr590_AssignedFrom@odata.bind': `/${ENTITY_SETS.employees}(${assignedFromId})` } : {}),
    ...(assignedToId ? { 'cr590_AssignedTo@odata.bind': `/${ENTITY_SETS.employees}(${assignedToId})` } : {}),
    cr590_assignmentname: `${type === 'initial' ? '首次派发' : type === 'reassignment' ? '负责人转派' : '撤销派发'} ${workOrder.workOrderNumber}`,
    cr590_assignedat: occurredAt,
    cr590_assignmenttype: ASSIGNMENT_TYPE[type],
    cr590_assignmentnote: note.slice(0, 100),
    cr590_assignmentsource: MANUAL_SOURCE,
    statecode: 0,
  } as Omit<Cr590_assignmentsBase, 'cr590_assignmentid'>
  unwrapWrite(await Cr590_assignmentsService.create(payload), 'Assignment')
}

function validateWorkOrderInput(input: WorkOrderInput): void {
  if (!input.workOrderName.trim()) throw new Error('请填写工单标题。')
  if (input.workOrderName.trim().length > 850) throw new Error('工单标题不能超过 850 个字符。')
  if (input.issueDescription.trim().length > 100) throw new Error('问题描述不能超过 100 个字符，当前 Dataverse 列为单行文本。')
  if (!input.departmentId) throw new Error('请选择负责部门。')
  if (!input.serviceCategoryId) throw new Error('请选择服务类别。')
}

function ensureAvailableEmployee(employee: EmployeeOption, state: WorkOrderStoreState, latestLoad?: number): void {
  if (!employee.isActive) throw new Error('不能派发给已停用的员工。')
  if (!employee.isAvailableForOrder) throw new Error('该员工当前不可接单。')
  const currentLoad = latestLoad ?? state.workOrders.filter((workOrder) =>
    workOrder.assignedToId === employee.id && ACTIVE_STATUSES.includes(workOrder.status),
  ).length
  if (employee.maxTaskLoad != null && currentLoad >= employee.maxTaskLoad) {
    throw new Error(`${employee.employeeName} 已达到最大工作负载（${currentLoad}/${employee.maxTaskLoad}）。`)
  }
}

function partialFailure(stage: string, error: unknown, recordAction?: string): PartialWorkOrderWriteError {
  return new PartialWorkOrderWriteError(stage, error, recordAction)
}

export async function createDataverseWorkOrder(input: WorkOrderInput, departmentName: string, categoryName: string): Promise<string> {
  validateWorkOrderInput(input)
  const now = new Date().toISOString()
  const result = unwrapWrite(await Cr590_workordersService.create({
    cr590_workordername: input.workOrderName.trim(),
    cr590_issuedescription: input.issueDescription.trim(),
    cr590_priority: input.priority,
    cr590_status: WORK_ORDER_STATUS.new as Cr590_workorderscr590_status,
    'cr590_Department@odata.bind': `/${ENTITY_SETS.departments}(${input.departmentId})`,
    'cr590_ServiceCategory@odata.bind': `/${ENTITY_SETS.serviceCategories}(${input.serviceCategoryId})`,
    cr590_createtime: now,
    cr590_expectedcompletiontime: input.expectedCompletionTime || undefined,
    statecode: 0,
  }), 'WorkOrder')

  const workOrderId = result.cr590_workorderid
  if (!workOrderId) throw new Error('工单已创建，但 Dataverse 没有返回记录 ID；请重新读取后确认，不要重复提交。')
  const workOrder: WorkOrder = {
    id: workOrderId,
    workOrderNumber: result.cr590_workordernumber ?? '',
    workOrderName: input.workOrderName.trim(),
    issueDescription: input.issueDescription.trim(),
    priority: input.priority,
    status: WORK_ORDER_STATUS.new,
    assignedToId: null,
    assignedToName: null,
    departmentId: input.departmentId,
    department: departmentName,
    serviceCategoryId: input.serviceCategoryId,
    serviceCategoryLabel: categoryName,
    createTime: now,
    expectedCompletionTime: input.expectedCompletionTime,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    createdBy: null,
    modifiedAt: null,
  }
  try {
    await createHistory({ workOrder, type: HISTORY_TYPE.created, description: '工单已创建并进入待分派状态', occurredAt: now, newStatus: WORK_ORDER_STATUS.new })
  } catch (error) {
    throw partialFailure('创建历史记录', error, '已创建')
  }
  return workOrderId
}

export async function updateDataverseWorkOrder(
  current: WorkOrder,
  input: WorkOrderInput,
  departmentName: string,
  categoryName: string,
): Promise<void> {
  validateWorkOrderInput(input)
  if (([WORK_ORDER_STATUS.closed, WORK_ORDER_STATUS.cancelled] as readonly WorkOrderStatus[]).includes(current.status)) {
    throw new Error('已关闭或已取消的工单不能编辑。')
  }
  const patch: WorkOrderPatch = {
    cr590_workordername: input.workOrderName.trim(),
    cr590_issuedescription: input.issueDescription.trim(),
    cr590_priority: input.priority,
    'cr590_Department@odata.bind': `/${ENTITY_SETS.departments}(${input.departmentId})`,
    'cr590_ServiceCategory@odata.bind': `/${ENTITY_SETS.serviceCategories}(${input.serviceCategoryId})`,
    cr590_expectedcompletiontime: input.expectedCompletionTime,
  }
  const changes: Array<{ type: Cr590_tablescr590_historytype; description: string }> = []
  const workOrderFieldsChanged = [
    current.workOrderName !== input.workOrderName.trim() ? '标题' : null,
    current.issueDescription !== input.issueDescription.trim() ? '问题描述' : null,
    current.expectedCompletionTime !== input.expectedCompletionTime ? '预计完成时间' : null,
  ].filter((field): field is string => field !== null)
  if (workOrderFieldsChanged.length > 0) {
    changes.push({ type: HISTORY_TYPE.generalUpdate, description: `工单信息已更新：${workOrderFieldsChanged.join('、')}` })
  }
  if (current.priority !== input.priority) {
    changes.push({ type: HISTORY_TYPE.priorityChange, description: `优先级由${PRIORITY_LABELS[current.priority]}调整为${PRIORITY_LABELS[input.priority]}` })
  }
  if (current.departmentId !== input.departmentId) {
    changes.push({ type: HISTORY_TYPE.departmentChange, description: `负责部门由${current.department || '未指定'}调整为${departmentName}` })
  }
  if (current.serviceCategoryId !== input.serviceCategoryId) {
    changes.push({ type: HISTORY_TYPE.generalUpdate, description: `服务类别由${current.serviceCategoryLabel || '未设置'}调整为${categoryName}` })
  }
  if (changes.length === 0) return

  await updateWorkOrder(current.id, patch)
  const occurredAt = new Date().toISOString()
  for (const change of changes) {
    try {
      await createHistory({ workOrder: current, ...change, occurredAt, previousStatus: current.status, newStatus: current.status })
    } catch (error) {
      throw partialFailure('记录工单编辑历史', error)
    }
  }
}

export async function assignDataverseWorkOrder(
  current: WorkOrder,
  employee: EmployeeOption,
  state: WorkOrderStoreState,
  note: string,
  latestLoad?: number,
): Promise<void> {
  if (!([WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold] as readonly WorkOrderStatus[]).includes(current.status)) {
    throw new Error('当前状态不允许派发或转派。')
  }
  if (current.assignedToId === employee.id) throw new Error('该员工已经是当前负责人。')
  ensureAvailableEmployee(employee, state, latestLoad)
  const kind = current.assignedToId ? 'reassignment' : 'initial'
  if (kind === 'reassignment' && !note.trim()) throw new Error('转派时请填写原因。')
  if (note.length > 100) throw new Error('派发说明不能超过 100 个字符。')

  const nextStatus = current.status === WORK_ORDER_STATUS.new
    || current.status === WORK_ORDER_STATUS.inProgress
    || current.status === WORK_ORDER_STATUS.onHold
    ? WORK_ORDER_STATUS.assigned
    : current.status
  const occurredAt = new Date().toISOString()
  await updateWorkOrder(current.id, {
    'cr590_AssignedTo@odata.bind': `/${ENTITY_SETS.employees}(${employee.id})`,
    cr590_status: nextStatus as Cr590_workorderscr590_status,
  })

  try {
    await createAssignment({
      workOrder: current,
      assignedFromId: current.assignedToId,
      assignedToId: employee.id,
      type: kind,
      note,
      occurredAt,
    })
  } catch (error) {
    throw partialFailure('写入派发记录', error)
  }
  try {
    await createHistory({
      workOrder: current,
      type: HISTORY_TYPE.assignmentChange,
      description: `${kind === 'initial' ? '首次派发' : '转派'}给${employee.employeeName}${note.trim() ? `：${note.trim()}` : ''}`,
      remarks: note,
      occurredAt,
      previousStatus: current.status,
      newStatus: nextStatus,
    })
    if (nextStatus !== current.status) {
      await createHistory({
        workOrder: current,
        type: HISTORY_TYPE.statusChange,
        description: `状态由${STATUS_LABELS[current.status]}变更为${STATUS_LABELS[nextStatus]}`,
        occurredAt,
        previousStatus: current.status,
        newStatus: nextStatus,
      })
    }
  } catch (error) {
    throw partialFailure('写入派发历史', error)
  }
}

export async function unassignDataverseWorkOrder(current: WorkOrder, note: string): Promise<void> {
  if (current.status !== WORK_ORDER_STATUS.assigned || !current.assignedToId) {
    throw new Error('只有已分派且尚未开始处理的工单可以撤派。')
  }
  if (!note.trim()) throw new Error('撤派时请填写原因。')
  if (note.length > 100) throw new Error('撤派说明不能超过 100 个字符。')

  const occurredAt = new Date().toISOString()
  await updateWorkOrder(current.id, {
    'cr590_AssignedTo@odata.bind': null,
    cr590_status: WORK_ORDER_STATUS.new as Cr590_workorderscr590_status,
  })
  try {
    await createAssignment({
      workOrder: current,
      assignedFromId: current.assignedToId,
      assignedToId: null,
      type: 'unassignment',
      note,
      occurredAt,
    })
  } catch (error) {
    throw partialFailure('写入撤派记录', error)
  }
  try {
    await createHistory({
      workOrder: current,
      type: HISTORY_TYPE.assignmentChange,
      description: `已撤销负责人${current.assignedToName ? ` ${current.assignedToName}` : ''}：${note.trim()}`,
      remarks: note,
      occurredAt,
      previousStatus: current.status,
      newStatus: WORK_ORDER_STATUS.new,
    })
    await createHistory({
      workOrder: current,
      type: HISTORY_TYPE.statusChange,
      description: `状态由${STATUS_LABELS[current.status]}变更为${STATUS_LABELS[WORK_ORDER_STATUS.new]}`,
      occurredAt,
      previousStatus: current.status,
      newStatus: WORK_ORDER_STATUS.new,
    })
  } catch (error) {
    throw partialFailure('写入撤派历史', error)
  }
}

export async function transitionDataverseWorkOrder(
  current: WorkOrder,
  nextStatus: WorkOrderStatus,
  note: string,
): Promise<void> {
  const blocker = getStatusTransitionBlocker(current, nextStatus, note)
  if (blocker) throw new Error(blocker)

  const occurredAt = new Date().toISOString()
  const patch: WorkOrderPatch = { cr590_status: nextStatus as Cr590_workorderscr590_status }
  if (nextStatus === WORK_ORDER_STATUS.resolved) {
    patch.cr590_resolution = note.trim()
    patch.cr590_resolvedat = occurredAt
  }
  if (current.status === WORK_ORDER_STATUS.resolved && nextStatus === WORK_ORDER_STATUS.inProgress) {
    patch.cr590_resolution = null
    patch.cr590_resolvedat = null
  }
  if (nextStatus === WORK_ORDER_STATUS.closed) patch.cr590_closedat = occurredAt
  if (nextStatus === WORK_ORDER_STATUS.cancelled && current.assignedToId) {
    patch['cr590_AssignedTo@odata.bind'] = null
  }
  await updateWorkOrder(current.id, patch)

  if (nextStatus === WORK_ORDER_STATUS.cancelled && current.assignedToId) {
    try {
      await createAssignment({
        workOrder: current,
        assignedFromId: current.assignedToId,
        assignedToId: null,
        type: 'unassignment',
        note: `工单取消：${note.trim()}`,
        occurredAt,
      })
      await createHistory({
        workOrder: current,
        type: HISTORY_TYPE.assignmentChange,
        description: `工单取消时同步撤销负责人${current.assignedToName ? ` ${current.assignedToName}` : ''}`,
        occurredAt,
        previousStatus: current.status,
        newStatus: WORK_ORDER_STATUS.cancelled,
      })
    } catch (error) {
      throw partialFailure('写入取消时的撤派记录', error)
    }
  }

  const description = nextStatus === WORK_ORDER_STATUS.resolved
    ? `状态由${STATUS_LABELS[current.status]}变更为${STATUS_LABELS[nextStatus]}`
    : nextStatus === WORK_ORDER_STATUS.cancelled
      ? `工单已取消：${note.trim()}`
      : current.status === WORK_ORDER_STATUS.resolved && nextStatus === WORK_ORDER_STATUS.inProgress
        ? `工单重新打开${note.trim() ? `：${note.trim()}` : ''}`
        : nextStatus === WORK_ORDER_STATUS.onHold
          ? `工单暂停：${note.trim()}`
          : note.trim() || `状态由${STATUS_LABELS[current.status]}变更为${STATUS_LABELS[nextStatus]}`
  try {
    if (nextStatus === WORK_ORDER_STATUS.resolved) {
      await createHistory({
        workOrder: current,
        type: HISTORY_TYPE.resolutionUpdate,
        description: `工单解决方案：${note.trim()}`,
        remarks: note,
        occurredAt,
        previousStatus: current.status,
        newStatus: nextStatus,
      })
    }
    await createHistory({
      workOrder: current,
      type: nextStatus === WORK_ORDER_STATUS.cancelled ? HISTORY_TYPE.cancelled : HISTORY_TYPE.statusChange,
      description,
      remarks: nextStatus === WORK_ORDER_STATUS.resolved ? undefined : note,
      occurredAt,
      previousStatus: current.status,
      newStatus: nextStatus,
    })
  } catch (error) {
    throw partialFailure('写入状态变更历史', error)
  }
}
