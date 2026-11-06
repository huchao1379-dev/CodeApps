import type { IOperationResult } from '@microsoft/power-apps/data'
import { Cr590_assignmentapprovalrequestsService } from '../../../generated/services/Cr590_assignmentapprovalrequestsService'
import {
  Cr590_assignmentapprovalrequestscr590_approvalstatus,
  type Cr590_assignmentapprovalrequests,
} from '../../../generated/models/Cr590_assignmentapprovalrequestsModel'

type FormattedLookup<name extends string> = {
  [key in `_${name}_value@OData.Community.Display.V1.FormattedValue`]?: string
}

type ApprovalRequestRecord = Cr590_assignmentapprovalrequests
  & FormattedLookup<'cr590_originalassignedto'>
  & FormattedLookup<'cr590_requestedassignedto'>
  & FormattedLookup<'cr590_workorder'>

export interface AssignmentApprovalRequest {
  id: string
  requestNumber: string
  status: string
  submittedAt: string | null
  completedAt: string | null
  originalAssignedToName: string | null
  requestedAssignedToName: string | null
  reason: string
  approvalComments: string | null
  errorDetail: string | null
}

function unwrap<T>(result: IOperationResult<T>): T {
  if (result.success) return result.data
  const message = result.error instanceof Error ? result.error.message : '运行时未提供错误详情'
  throw new Error(`读取负责人变更申请失败：${message}`)
}

function formattedValue(record: object, key: string): string | null {
  const value = (record as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

export async function loadAssignmentApprovalRequests(workOrderId: string): Promise<AssignmentApprovalRequest[]> {
  const id = workOrderId.replace(/[{}]/g, '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('工单标识无效，无法读取负责人变更申请。')
  }

  const result = await Cr590_assignmentapprovalrequestsService.getAll({
    select: [
      'cr590_assignmentapprovalrequestid', 'cr590_requestnumber', 'cr590_approvalstatus',
      'cr590_submitteddat', 'cr590_completedat', '_cr590_originalassignedto_value',
      '_cr590_requestedassignedto_value', '_cr590_workorder_value', 'cr590_reason',
      'cr590_approvalcomments', 'cr590_errordetail',
    ],
    filter: `_cr590_workorder_value eq ${id}`,
    orderBy: ['cr590_submitteddat desc'],
    top: 20,
    maxPageSize: 20,
  })

  return unwrap(result).map((item) => {
    const record = item as ApprovalRequestRecord
    const statusValue = Number(record.cr590_approvalstatus)
    return {
      id: record.cr590_assignmentapprovalrequestid,
      requestNumber: record.cr590_requestnumber ?? '',
      status: Cr590_assignmentapprovalrequestscr590_approvalstatus[statusValue as keyof typeof Cr590_assignmentapprovalrequestscr590_approvalstatus] ?? '未知状态',
      submittedAt: record.cr590_submitteddat ?? record.createdon ?? null,
      completedAt: record.cr590_completedat ?? null,
      originalAssignedToName: formattedValue(record, '_cr590_originalassignedto_value@OData.Community.Display.V1.FormattedValue'),
      requestedAssignedToName: formattedValue(record, '_cr590_requestedassignedto_value@OData.Community.Display.V1.FormattedValue'),
      reason: record.cr590_reason ?? '',
      approvalComments: record.cr590_approvalcomments ?? null,
      errorDetail: record.cr590_errordetail ?? null,
    }
  })
}
