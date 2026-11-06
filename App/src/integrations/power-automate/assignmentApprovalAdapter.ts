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

  const response = result.data
  if (!response.requestid) {
    throw new Error(response.message || 'Flow 未返回审批申请 ID；请检查 Power Automate 的“响应 Power Apps 或流”步骤。')
  }
  if (response.result && !['pending', 'submitted', 'success'].includes(response.result.toLowerCase())) {
    throw new Error(response.message || `Flow 返回未预期结果：${response.result}`)
  }

  return {
    requestId: response.requestid,
    requestNumber: response.requestnumber ?? '',
    message: response.message ?? '负责人变更审批申请已提交。',
  }
}
