import type { IOperationResult } from '@microsoft/power-apps/data'
import { Cr590_assignmentsService } from '../../../generated/services/Cr590_assignmentsService'
import { Cr590_servicecategoriesService } from '../../../generated/services/Cr590_servicecategoriesService'
import { Cr590_table1sService } from '../../../generated/services/Cr590_table1sService'
import { Cr590_table2sService } from '../../../generated/services/Cr590_table2sService'
import { Cr590_tablesService } from '../../../generated/services/Cr590_tablesService'
import { Cr590_workordersService } from '../../../generated/services/Cr590_workordersService'
import type { Cr590_assignments } from '../../../generated/models/Cr590_assignmentsModel'
import {
  Cr590_assignmentscr590_assignmentsource,
  Cr590_assignmentscr590_assignmenttype,
} from '../../../generated/models/Cr590_assignmentsModel'
import type { Cr590_servicecategories } from '../../../generated/models/Cr590_servicecategoriesModel'
import { Cr590_servicecategoriescr590_defaultpriority } from '../../../generated/models/Cr590_servicecategoriesModel'
import type { Cr590_table1s } from '../../../generated/models/Cr590_table1sModel'
import type { Cr590_table2s } from '../../../generated/models/Cr590_table2sModel'
import { Cr590_table2scr590_gender } from '../../../generated/models/Cr590_table2sModel'
import type { Cr590_tables } from '../../../generated/models/Cr590_tablesModel'
import {
  Cr590_tablescr590_historytype,
  Cr590_tablescr590_newstatus,
  Cr590_tablescr590_previousstatus,
  Cr590_tablescr590_status,
} from '../../../generated/models/Cr590_tablesModel'
import type { Cr590_workorders } from '../../../generated/models/Cr590_workordersModel'
import { Cr590_workorderscr590_priority, Cr590_workorderscr590_status } from '../../../generated/models/Cr590_workordersModel'
import {
  WORK_ORDER_STATUS,
  type AssignmentEvent,
  type DepartmentOption,
  type EmployeeOption,
  type Priority,
  type ServiceCategoryOption,
  type WorkOrder,
  type WorkOrderEvent,
  type WorkOrderStoreState,
  type WorkOrderStatus,
} from '../types/workOrder.types'

type FormattedLookup<name extends string> = {
  [key in `_${name}_value@OData.Community.Display.V1.FormattedValue`]?: string
}

type WorkOrderRecord = Cr590_workorders
  & FormattedLookup<'cr590_assignedto'>
  & FormattedLookup<'cr590_department'>
  & FormattedLookup<'cr590_servicecategory'>
  & FormattedLookup<'createdby'>

type AssignmentRecord = Cr590_assignments
  & FormattedLookup<'cr590_workorder'>
  & FormattedLookup<'cr590_assignedfrom'>
  & FormattedLookup<'cr590_assignedto'>
  & FormattedLookup<'createdby'>

type HistoryRecord = Cr590_tables
  & FormattedLookup<'cr590_workorder'>
  & FormattedLookup<'createdby'>
  & {
    'cr590_previousstatus@OData.Community.Display.V1.FormattedValue'?: string
    'cr590_newstatus@OData.Community.Display.V1.FormattedValue'?: string
    'cr590_status@OData.Community.Display.V1.FormattedValue'?: string
  }

type EmployeeRecord = Cr590_table2s
  & FormattedLookup<'cr590_department'>

type DepartmentRecord = Cr590_table1s
  & FormattedLookup<'cr590_manager'>

type ServiceCategoryRecord = Cr590_servicecategories
  & FormattedLookup<'cr590_defaultdepartment'>

const PAGE_SIZE = 500
const WORK_ORDER_SELECT = [
  'cr590_workorderid', 'cr590_workordernumber', 'cr590_workordername',
  'cr590_issuedescription', 'cr590_priority', 'cr590_status',
  '_cr590_assignedto_value', '_cr590_department_value', '_cr590_servicecategory_value',
  'cr590_createtime', 'cr590_expectedcompletiontime', 'cr590_resolution',
  'cr590_resolvedat', 'cr590_closedat', '_createdby_value', 'createdon', 'modifiedon',
]
const EMPLOYEE_SELECT = [
  'cr590_table2id', 'cr590_employeename', 'cr590_email', '_cr590_department_value',
  'cr590_gender', 'cr590_age', 'cr590_hiredate', 'cr590_isactive',
  'cr590_isavailablefororder', 'cr590_maxtaskload', 'cr590_skills', 'statecode',
]

type DataverseErrorDetails = {
  message?: unknown
  status?: unknown
  requestId?: unknown
}

export function toDataverseError(source: string, error: unknown): Error {
  const prefix = `读取 Dataverse 数据源 ${source} 失败`
  if (error instanceof Error && error.message.startsWith(prefix)) return error

  const details = (typeof error === 'object' && error !== null ? error : {}) as DataverseErrorDetails
  const message = typeof details.message === 'string'
    ? details.message
    : error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '运行时未提供错误详情'
  const status = typeof details.status === 'number' ? details.status : undefined
  const requestId = typeof details.requestId === 'string' ? details.requestId : undefined
  const statusText = status === undefined ? '' : `（HTTP ${status}）`
  const accessHint = status === 403
    ? ' 当前运行身份可能没有该表的读取权限，或此应用未获准使用该数据源；请核对 Dataverse 安全角色和应用数据源绑定。'
    : ''
  const requestText = requestId ? ` 请求 ID：${requestId}。` : ''
  return new Error(`${prefix}${statusText}：${message}。${accessHint}${requestText}`)
}

function unwrap<T>(result: IOperationResult<T>, source: string): T {
  if (!result.success) {
    throw toDataverseError(source, result.error ?? new Error('运行时返回失败结果，但没有提供错误详情'))
  }
  return result.data
}

async function readAllSourceRows<T>(
  source: string,
  read: (skipToken?: string) => Promise<IOperationResult<T[]>>,
): Promise<T[]> {
  const rows: T[] = []
  const seenTokens = new Set<string>()
  let skipToken: string | undefined

  while (true) {
    let result: IOperationResult<T[]>
    try {
      result = await read(skipToken)
    } catch (error) {
      throw toDataverseError(source, error)
    }

    rows.push(...unwrap(result, source))
    const nextToken = result.skipToken
    if (!nextToken) return rows
    if (seenTokens.has(nextToken)) throw new Error(`Dataverse ${source} 分页令牌重复，已停止读取以避免循环。`)
    seenTokens.add(nextToken)
    skipToken = nextToken
  }
}

async function readOptionalSource<T>(
  source: string,
  read: () => Promise<T>,
  fallback: T,
  warnings: string[],
): Promise<T> {
  try {
    return await read()
  } catch (error) {
    warnings.push(toDataverseError(source, error).message)
    return fallback
  }
}

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value.replace(/[{}]/g, '')
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id.replace(/[{}]/g, '')
  }
  return null
}

function choiceLabel<T extends object>(choices: T, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const label = choices[String(Number(value)) as keyof T]
  return typeof label === 'string' ? label : null
}

function requiredChoice<T extends number>(value: unknown, allowed: readonly T[], field: string): T {
  const numericValue = Number(value)
  if (!allowed.includes(numericValue as T)) {
    throw new Error(`Dataverse 字段 ${field} 返回了尚未映射的选项值：${String(value)}`)
  }
  return numericValue as T
}

function formattedValue<T extends object>(record: T, key: string): string | null {
  const value = (record as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function mapWorkOrder(record: WorkOrderRecord): WorkOrder {
  const status = requiredChoice(record.cr590_status, Object.keys(Cr590_workorderscr590_status).map(Number), 'WorkOrder.Status') as WorkOrderStatus
  const priority = requiredChoice(record.cr590_priority, Object.keys(Cr590_workorderscr590_priority).map(Number), 'WorkOrder.Priority') as Priority
  return {
    id: record.cr590_workorderid,
    workOrderNumber: record.cr590_workordernumber ?? '',
    workOrderName: record.cr590_workordername ?? '(未命名工单)',
    issueDescription: record.cr590_issuedescription ?? '',
    priority,
    status,
    assignedToId: asId(record._cr590_assignedto_value),
    assignedToName: formattedValue(record, '_cr590_assignedto_value@OData.Community.Display.V1.FormattedValue'),
    departmentId: asId(record._cr590_department_value),
    department: formattedValue(record, '_cr590_department_value@OData.Community.Display.V1.FormattedValue') ?? '',
    serviceCategoryId: asId(record._cr590_servicecategory_value),
    serviceCategoryLabel: formattedValue(record, '_cr590_servicecategory_value@OData.Community.Display.V1.FormattedValue'),
    createTime: record.cr590_createtime ?? record.createdon ?? new Date(0).toISOString(),
    expectedCompletionTime: record.cr590_expectedcompletiontime ?? null,
    resolution: record.cr590_resolution ?? null,
    resolvedAt: record.cr590_resolvedat ?? null,
    closedAt: record.cr590_closedat ?? null,
    createdBy: formattedValue(record, '_createdby_value@OData.Community.Display.V1.FormattedValue'),
    modifiedAt: record.modifiedon ?? null,
  }
}

function mapAssignment(record: AssignmentRecord): AssignmentEvent {
  const typeValue = Number(record.cr590_assignmenttype)
  const sourceValue = Number(record.cr590_assignmentsource)
  const assignmentType: AssignmentEvent['assignmentType'] = typeValue === 326990000
    ? 'initial'
    : typeValue === 326990002
      ? 'unassignment'
      : 'reassignment'
  const typeLabels: Record<number, string> = {
    326990000: '首次派发',
    326990001: '转派',
    326990002: '撤销派发',
    326990003: '回退转派',
  }
  const sourceLabels: Record<number, string> = {
    326990000: '人工操作',
    326990001: '自动派发',
    326990002: '批量操作',
    326990003: '系统流程',
  }
  return {
    id: record.cr590_assignmentid,
    assignmentNumber: record.cr590_assignmentnumber ?? '',
    workOrderId: asId(record._cr590_workorder_value) ?? '',
    assignedFromId: asId(record._cr590_assignedfrom_value),
    assignedFromName: formattedValue(record, '_cr590_assignedfrom_value@OData.Community.Display.V1.FormattedValue'),
    assignedToId: asId(record._cr590_assignedto_value),
    assignedToName: formattedValue(record, '_cr590_assignedto_value@OData.Community.Display.V1.FormattedValue'),
    assignedAt: record.cr590_assignedat ?? record.createdon ?? new Date(0).toISOString(),
    assignmentType,
    assignmentTypeLabel: typeLabels[typeValue] ?? choiceLabel(Cr590_assignmentscr590_assignmenttype, typeValue) ?? '派发变更',
    assignmentNote: record.cr590_assignmentnote ?? '',
    assignmentSource: choiceLabel(Cr590_assignmentscr590_assignmentsource, sourceValue) ?? 'Manual',
    assignmentSourceLabel: sourceLabels[sourceValue] ?? '未知来源',
    createdBy: formattedValue(record, '_createdby_value@OData.Community.Display.V1.FormattedValue'),
  }
}

function mapHistory(record: HistoryRecord): WorkOrderEvent {
  const typeValue = Number(record.cr590_historytype)
  const historyTypeLabels: Record<number, string> = {
    326990000: '状态变更',
    326990001: '负责人变更',
    326990002: '优先级变更',
    326990003: '部门变更',
    326990004: '解决方案更新',
    326990005: '工单信息更新',
    326990006: '工单创建',
    326990007: '工单取消',
  }
  const kind: WorkOrderEvent['kind'] = typeValue === 326990006
    ? 'created'
    : typeValue === 326990000
      ? 'status-change'
      : typeValue === 326990001
        ? 'assignment-change'
        : 'updated'
  const historyTypeLabel = historyTypeLabels[typeValue]
    ?? choiceLabel(Cr590_tablescr590_historytype, record.cr590_historytype)
    ?? '工单变更'
  return {
    id: record.cr590_tableid,
    historyNumber: record.cr590_historynumber ?? '',
    workOrderId: asId(record._cr590_workorder_value) ?? '',
    kind,
    historyTypeLabel,
    occurredAt: record.cr590_changedat ?? record.createdon ?? new Date(0).toISOString(),
    previousStatusLabel: formattedValue(record, 'cr590_previousstatus@OData.Community.Display.V1.FormattedValue')
      ?? choiceLabel(Cr590_tablescr590_previousstatus, record.cr590_previousstatus),
    newStatusLabel: formattedValue(record, 'cr590_newstatus@OData.Community.Display.V1.FormattedValue')
      ?? choiceLabel(Cr590_tablescr590_newstatus, record.cr590_newstatus),
    historyStatusLabel: formattedValue(record, 'cr590_status@OData.Community.Display.V1.FormattedValue')
      ?? choiceLabel(Cr590_tablescr590_status, record.cr590_status),
    description: record.cr590_changedescription ?? record.cr590_remarks ?? historyTypeLabel,
    remarks: record.cr590_remarks ?? null,
    createdBy: formattedValue(record, '_createdby_value@OData.Community.Display.V1.FormattedValue'),
  }
}

function mapEmployee(record: EmployeeRecord): EmployeeOption {
  return {
    id: record.cr590_table2id,
    employeeName: record.cr590_employeename ?? '(未命名员工)',
    email: record.cr590_email ?? null,
    departmentId: asId(record._cr590_department_value),
    department: formattedValue(record, '_cr590_department_value@OData.Community.Display.V1.FormattedValue'),
    gender: formattedValue(record, 'cr590_gender@OData.Community.Display.V1.FormattedValue')
      ?? choiceLabel(Cr590_table2scr590_gender, record.cr590_gender),
    genderValue: record.cr590_gender ?? null,
    age: record.cr590_age ?? null,
    hireDate: record.cr590_hiredate ?? null,
    isActive: record.cr590_isactive === true && record.statecode === 0,
    isAvailableForOrder: record.cr590_isavailablefororder === true,
    maxTaskLoad: record.cr590_maxtaskload ?? null,
    skills: record.cr590_skills ?? null,
  }
}

function mapDepartment(record: DepartmentRecord): DepartmentOption {
  return {
    id: record.cr590_table1id,
    // The generated environment schema spells this existing column "deparmentcode".
    departmentCode: record.cr590_deparmentcode ?? '',
    departmentName: record.cr590_departmentname ?? '(未命名部门)',
    description: record.cr590_description ?? null,
    establishedDate: record.cr590_establisheddate ?? null,
    managerId: asId(record._cr590_manager_value),
    managerName: formattedValue(record, '_cr590_manager_value@OData.Community.Display.V1.FormattedValue'),
    isActive: record.cr590_isactive === true && record.statecode === 0,
  }
}

function mapServiceCategory(record: ServiceCategoryRecord): ServiceCategoryOption {
  const defaultPriority = record.cr590_defaultpriority
  const priority = defaultPriority === undefined
    ? null
    : requiredChoice(
      defaultPriority,
      Object.keys(Cr590_servicecategoriescr590_defaultpriority).map(Number),
      'ServiceCategory.DefaultPriority',
    ) as Priority
  return {
    id: record.cr590_servicecategoryid,
    categoryCode: record.cr590_categorycode ?? '',
    serviceCategoryName: record.cr590_servicecategoryname ?? '(未命名服务类别)',
    description: record.cr590_description ?? null,
    defaultPriority: priority,
    defaultDepartmentId: asId(record._cr590_defaultdepartment_value),
    defaultDepartmentName: formattedValue(record, '_cr590_defaultdepartment_value@OData.Community.Display.V1.FormattedValue'),
    isActive: record.cr590_isactive === true && record.statecode === 0,
  }
}

/** Reads all six Dataverse tables; work orders are required, reference/history reads degrade independently. */
export async function loadWorkOrderStateFromDataverse(): Promise<WorkOrderStoreState> {
  const workOrders = (await readAllSourceRows('cr590_workorders', (skipToken) => Cr590_workordersService.getAll({
    select: WORK_ORDER_SELECT,
    orderBy: ['cr590_createtime desc'],
    maxPageSize: PAGE_SIZE,
    ...(skipToken ? { skipToken } : {}),
  }))).map((record) => mapWorkOrder(record as WorkOrderRecord))

  const warnings: string[] = []
  const [assignmentRows, historyRows, employeeRows, departmentRows, serviceCategoryRows] = await Promise.all([
    readOptionalSource('cr590_assignments', async () => (await readAllSourceRows('cr590_assignments', (skipToken) => Cr590_assignmentsService.getAll({
      select: [
        'cr590_assignmentid', 'cr590_assignmentnumber', '_cr590_workorder_value',
        '_cr590_assignedfrom_value', '_cr590_assignedto_value', 'cr590_assignedat',
        'cr590_assignmenttype', 'cr590_assignmentnote', 'cr590_assignmentsource',
        '_createdby_value', 'createdon',
      ],
      orderBy: ['cr590_assignedat desc'], maxPageSize: PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    }))).map((record) => mapAssignment(record as AssignmentRecord)), [], warnings),
    readOptionalSource('cr590_tables', async () => (await readAllSourceRows('cr590_tables', (skipToken) => Cr590_tablesService.getAll({
      select: [
        'cr590_tableid', 'cr590_historynumber', '_cr590_workorder_value', 'cr590_historytype',
        'cr590_previousstatus', 'cr590_newstatus', 'cr590_status', 'cr590_changedat',
        'cr590_changedescription', 'cr590_remarks', '_createdby_value', 'createdon',
      ],
      orderBy: ['cr590_changedat desc'], maxPageSize: PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    }))).map((record) => mapHistory(record as HistoryRecord)), [], warnings),
    readOptionalSource('cr590_table2s', async () => (await readAllSourceRows('cr590_table2s', (skipToken) => Cr590_table2sService.getAll({
      select: EMPLOYEE_SELECT,
      orderBy: ['cr590_employeename asc'], maxPageSize: PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    }))).map((record) => mapEmployee(record as EmployeeRecord)), [], warnings),
    readOptionalSource('cr590_table1s', async () => (await readAllSourceRows('cr590_table1s', (skipToken) => Cr590_table1sService.getAll({
      select: [
        'cr590_table1id', 'cr590_deparmentcode', 'cr590_departmentname', 'cr590_description',
        'cr590_establisheddate', 'cr590_isactive', '_cr590_manager_value',
        'statecode',
      ],
      orderBy: ['cr590_departmentname asc'], maxPageSize: PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    }))).map((record) => mapDepartment(record as DepartmentRecord)), [], warnings),
    readOptionalSource('cr590_servicecategories', async () => (await readAllSourceRows('cr590_servicecategories', (skipToken) => Cr590_servicecategoriesService.getAll({
      select: [
        'cr590_servicecategoryid', 'cr590_categorycode', 'cr590_servicecategoryname',
        'cr590_description', 'cr590_defaultpriority', '_cr590_defaultdepartment_value', 'cr590_isactive',
        'statecode',
      ],
      orderBy: ['cr590_servicecategoryname asc'], maxPageSize: PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    }))).map((record) => mapServiceCategory(record as ServiceCategoryRecord)), [], warnings),
  ])

  const workOrderIds = new Set(workOrders.map((workOrder) => workOrder.id))
  return {
    workOrders,
    assignments: assignmentRows.filter((event) => workOrderIds.has(event.workOrderId)),
    events: historyRows.filter((event) => workOrderIds.has(event.workOrderId)),
    employees: employeeRows,
    departments: departmentRows,
    serviceCategories: serviceCategoryRows,
    readWarnings: warnings,
  }
}

export interface WorkOrderAssignmentSnapshot {
  workOrder: WorkOrder
  employee: EmployeeOption
  currentLoad: number
}

function normalizeRecordId(id: string, label: string): string {
  const normalized = id.replace(/[{}]/g, '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${label}标识无效，请刷新后重试。`)
  }
  return normalized
}

/** Reads only the target order, employee, and that employee's active workload before assignment. */
export async function loadWorkOrderAssignmentSnapshot(
  workOrderId: string,
  employeeId: string,
): Promise<WorkOrderAssignmentSnapshot> {
  const normalizedWorkOrderId = normalizeRecordId(workOrderId, '工单')
  const normalizedEmployeeId = normalizeRecordId(employeeId, '员工')

  let orderResult: IOperationResult<Cr590_workorders>
  let employeeResult: IOperationResult<Cr590_table2s>
  try {
    [orderResult, employeeResult] = await Promise.all([
      Cr590_workordersService.get(normalizedWorkOrderId, { select: WORK_ORDER_SELECT }),
      Cr590_table2sService.get(normalizedEmployeeId, { select: EMPLOYEE_SELECT }),
    ])
  } catch (error) {
    throw toDataverseError('派单目标记录', error)
  }

  const orderRecord = unwrap(orderResult, 'cr590_workorders') as WorkOrderRecord
  const employeeRecord = unwrap(employeeResult, 'cr590_table2s') as EmployeeRecord
  if (!orderRecord.cr590_workorderid) throw new Error('工单已不存在或当前身份无权读取。')
  if (!employeeRecord.cr590_table2id) throw new Error('目标员工已不存在或当前身份无权读取。')

  const workOrder = mapWorkOrder(orderRecord)
  const employee = mapEmployee(employeeRecord)
  const activeStatusFilter = `(_cr590_assignedto_value eq ${normalizedEmployeeId}) and (statecode eq 0) and (cr590_status eq ${WORK_ORDER_STATUS.assigned} or cr590_status eq ${WORK_ORDER_STATUS.inProgress} or cr590_status eq ${WORK_ORDER_STATUS.onHold})`
  const top = employee.maxTaskLoad == null ? 1 : Math.min(Math.max(1, employee.maxTaskLoad + 1), 5000)
  let workloadResult: IOperationResult<Cr590_workorders[]>
  try {
    workloadResult = await Cr590_workordersService.getAll({
      select: ['cr590_workorderid'],
      filter: activeStatusFilter,
      top,
      maxPageSize: Math.min(top, PAGE_SIZE),
      count: true,
    })
  } catch (error) {
    throw toDataverseError('工程师当前工作负载', error)
  }
  const workloadRows = unwrap(workloadResult, 'cr590_workorders')
  const currentLoad = workloadResult.count ?? workloadRows.length
  if (employee.maxTaskLoad != null && employee.maxTaskLoad > 5000 && currentLoad >= 5000) {
    throw new Error('该员工工作负载超过 Dataverse 单次计数上限，无法可靠校验容量；请联系管理员检查负载配置。')
  }

  return { workOrder, employee, currentLoad }
}
