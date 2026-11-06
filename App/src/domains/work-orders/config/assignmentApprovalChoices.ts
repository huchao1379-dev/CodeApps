export const ASSIGNMENT_APPROVAL_STATUS_LABELS = {
  Pending: '待审批',
  Processing: '处理中',
  Approved: '已通过',
  Rejected: '已拒绝',
  Conflict: '有冲突',
  Failed: '处理失败',
} as const

export type AssignmentApprovalStatus = keyof typeof ASSIGNMENT_APPROVAL_STATUS_LABELS

export const assignmentApprovalStatusOptions: Array<{ value: 'all' | AssignmentApprovalStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  ...Object.entries(ASSIGNMENT_APPROVAL_STATUS_LABELS).map(([value, label]) => ({
    value: value as AssignmentApprovalStatus,
    label,
  })),
]

export function getAssignmentApprovalStatusLabel(status: string): string {
  return ASSIGNMENT_APPROVAL_STATUS_LABELS[status as AssignmentApprovalStatus] ?? status
}
