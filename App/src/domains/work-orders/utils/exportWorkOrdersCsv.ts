import {
  csvDateStamp,
  downloadCsvWorkbook,
  type CsvTable,
} from '../../../shared/utils/csvExport'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AssignmentEvent,
  type WorkOrder,
  type WorkOrderEvent,
  type WorkOrderStoreState,
} from '../types/workOrder.types'
import { formatDate } from './formatDate'

export interface ExportWorkOrdersCsvInput {
  workOrders: WorkOrder[]
  assignments?: AssignmentEvent[]
  events?: WorkOrderEvent[]
  /** Defaults to work-orders-export-YYYY-MM-DD.csv */
  filename?: string
}

export interface ExportWorkOrdersCsvResult {
  workOrderCount: number
  assignmentCount: number
  historyCount: number
  filename: string
}

function workOrderSheet(workOrders: WorkOrder[]): CsvTable {
  return {
    title: '工单明细',
    headers: [
      '工单编号',
      '工单标题',
      '问题描述',
      '状态',
      '优先级',
      '当前负责人',
      '负责部门',
      '服务类别',
      '创建时间',
      '预计完成',
      '解决时间',
      '关闭时间',
      '解决方案',
      '创建人',
      '最后修改',
    ],
    rows: workOrders.map((workOrder) => [
      workOrder.workOrderNumber,
      workOrder.workOrderName,
      workOrder.issueDescription,
      STATUS_LABELS[workOrder.status],
      PRIORITY_LABELS[workOrder.priority],
      workOrder.assignedToName ?? '',
      workOrder.department,
      workOrder.serviceCategoryLabel ?? '',
      formatDate(workOrder.createTime),
      formatDate(workOrder.expectedCompletionTime),
      formatDate(workOrder.resolvedAt),
      formatDate(workOrder.closedAt),
      workOrder.resolution ?? '',
      workOrder.createdBy ?? '',
      formatDate(workOrder.modifiedAt),
    ]),
  }
}

function assignmentSheet(workOrders: WorkOrder[], assignments: AssignmentEvent[]): CsvTable {
  const workOrderIds = new Set(workOrders.map((item) => item.id))
  const workOrderNumberById = new Map(workOrders.map((item) => [item.id, item.workOrderNumber]))
  const rows = assignments
    .filter((assignment) => workOrderIds.has(assignment.workOrderId))
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    .map((assignment) => [
      workOrderNumberById.get(assignment.workOrderId) ?? '',
      assignment.assignmentNumber ?? '',
      assignment.assignmentTypeLabel ?? assignment.assignmentType,
      assignment.assignedFromName ?? '',
      assignment.assignedToName ?? '',
      assignment.assignmentNote,
      assignment.assignmentSourceLabel ?? assignment.assignmentSource ?? '',
      assignment.createdBy ?? '',
      formatDate(assignment.assignedAt),
    ])

  return {
    title: '负责人变动（派发记录）',
    headers: [
      '工单编号',
      '派发编号',
      '变动类型',
      '原负责人',
      '新负责人',
      '备注',
      '来源',
      '操作人',
      '变动时间',
    ],
    rows,
  }
}

function historySheet(workOrders: WorkOrder[], events: WorkOrderEvent[]): CsvTable {
  const workOrderIds = new Set(workOrders.map((item) => item.id))
  const workOrderNumberById = new Map(workOrders.map((item) => [item.id, item.workOrderNumber]))
  const rows = events
    .filter((event) => workOrderIds.has(event.workOrderId))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((event) => [
      workOrderNumberById.get(event.workOrderId) ?? '',
      event.historyNumber ?? '',
      event.historyTypeLabel ?? event.kind,
      event.description,
      event.previousStatusLabel ?? (event.previousStatus != null ? STATUS_LABELS[event.previousStatus] : ''),
      event.newStatusLabel ?? (event.newStatus != null ? STATUS_LABELS[event.newStatus] : ''),
      event.historyStatusLabel ?? '',
      event.remarks ?? '',
      event.createdBy ?? '',
      formatDate(event.occurredAt),
    ])

  return {
    title: '工单历史',
    headers: [
      '工单编号',
      '历史编号',
      '事件类型',
      '描述',
      '原状态',
      '新状态',
      '历史状态',
      '备注',
      '操作人',
      '发生时间',
    ],
    rows,
  }
}

/** Build the multi-section CSV workbook for selected/visible work orders. */
export function buildWorkOrdersCsvWorkbook(input: ExportWorkOrdersCsvInput): {
  sheets: CsvTable[]
  result: Omit<ExportWorkOrdersCsvResult, 'filename'>
} {
  const workOrders = input.workOrders
  const assignments = input.assignments ?? []
  const events = input.events ?? []
  const sheets = [
    workOrderSheet(workOrders),
    assignmentSheet(workOrders, assignments),
    historySheet(workOrders, events),
  ]
  return {
    sheets,
    result: {
      workOrderCount: workOrders.length,
      assignmentCount: sheets[1]?.rows.length ?? 0,
      historyCount: sheets[2]?.rows.length ?? 0,
    },
  }
}

/** Export work orders together with assignee changes and history into one CSV file. */
export function exportWorkOrdersCsv(input: ExportWorkOrdersCsvInput): ExportWorkOrdersCsvResult {
  const filename = input.filename ?? `work-orders-export-${csvDateStamp()}.csv`
  const { sheets, result } = buildWorkOrdersCsvWorkbook(input)
  downloadCsvWorkbook({ filename, sheets })
  return { ...result, filename }
}

/** Convenience helper when the page already holds a WorkOrderStoreState. */
export function exportWorkOrdersFromState(
  workOrders: WorkOrder[],
  state: Pick<WorkOrderStoreState, 'assignments' | 'events'>,
  filename?: string,
): ExportWorkOrdersCsvResult {
  return exportWorkOrdersCsv({
    workOrders,
    assignments: state.assignments ?? [],
    events: state.events ?? [],
    filename,
  })
}
