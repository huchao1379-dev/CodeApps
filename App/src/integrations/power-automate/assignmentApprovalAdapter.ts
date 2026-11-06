import { getContext } from '@microsoft/power-apps/app'
import { _e8187cbfService } from '../../generated/services/_e8187cbfService'
import type { WorkOrder } from '../../domains/work-orders/types/workOrder.types'
import type { EmployeeOption } from '../../domains/work-orders/types/workOrder.types'

export interface AssignmentApprovalSubmission {
  requestId: string
  requestNumber: string
  message: string
}

function normalizeId(id: string, label: string): string {
  const normalized = id.replace(/[{}]/g, '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${label}标识无效，请刷新工单后重试。`)
  }
  return normalized
}

function firstText(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null
}

function isExplicitFailure(value: string | null): boolean {
  return value !== null && (['failed', 'failure', 'error', 'rejected'].includes(value.toLocaleLowerCase())
    || /(失败|错误|拒绝|未提交|未创建|未成功|failure|failed|error|rejected|unsuccessful|not\s+(submitted|created|successful))/i.test(value))
}

function hasSubmissionSuccess(resultValue: string | null, message: string | null, requestId: string | null): boolean {
  if (isExplicitFailure(resultValue) || isExplicitFailure(message)) return false
  if (requestId) return true
  return [resultValue, message].some((value) => Boolean(value && /(已提交|提交成功|成功提交|已创建|创建成功|成功创建|pending|submitted|created|success|succeeded|^ok$)/i.test(value)))
}

export async function submitAssignmentApprovalRequest(
  workOrder: WorkOrder,
  employee: EmployeeOption,
  reason: string,
): Promise<AssignmentApprovalSubmission> {
  if (!workOrder.assignedToId) throw new Error('首次派发不需要审批，请使用普通派发操作。')
  if (workOrder.assignedToId === employee.id) throw new Error('目标员工已经是当前负责人。')
  if (!reason.trim()) throw new Error('提交负责人变更审批时必须填写原因。')

  const context = await getContext()
  const requesterEmail = context.user.userPrincipalName?.trim()
  if (!requesterEmail) throw new Error('无法读取当前 Code App 用户邮箱，暂时不能提交审批。')

  const result = await _e8187cbfService.Run({
    text: normalizeId(workOrder.id, '工单'),
    text_1: normalizeId(employee.id, '目标员工'),
    text_2: normalizeId(workOrder.assignedToId, '原负责人'),
    text_3: reason.trim().slice(0, 100),
    text_4: requesterEmail.slice(0, 100),
    text_5: context.user.fullName?.trim().slice(0, 100),
  })

  if (!result.success) {
    const message = result.error instanceof Error ? result.error.message : '运行时未提供错误详情'
    throw new Error(`提交负责人变更审批失败：${message}`)
  }

  const response = result.data as typeof result.data & Record<string, unknown>
  const requestId = firstText(response.requestid, response.requestId, response.requestID, response.id)
  const requestNumber = firstText(response.requestnumber, response.requestNumber)
  const resultValue = firstText(response.result, response.status, response.outcome)
  const message = firstText(response.message, response.Message)
  if (!hasSubmissionSuccess(resultValue, message, requestId)) {
    throw new Error(message || `Flow 返回未预期结果：${resultValue ?? '空响应'}`)
  }

  return {
    // The request row is the source of truth. Some existing flows return only a
    // success message, so an empty ID must not turn an already-created request
    // into a false failure in the Code App.
    requestId: requestId ?? '',
    requestNumber: requestNumber ?? '',
    message: message ?? '负责人变更审批申请已提交。',
  }
}
