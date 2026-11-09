import type { StatusBadgeProps } from './StatusBadge.types'

const STATUS_VARIANTS: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  new: 'warning',
  pending: 'warning',
  pendingapproval: 'warning',
  overdue: 'danger',
  slaoverdue: 'danger',
  partial: 'warning',
  partialsuccess: 'warning',
  '待分派': 'warning',
  '待审批': 'warning',
  '已逾期': 'danger',
  '逾期': 'danger',
  '部分成功': 'warning',
  assigned: 'info',
  processing: 'info',
  inprogress: 'info',
  onhold: 'warning',
  '已分派': 'info',
  '处理中': 'info',
  '等待中': 'warning',
  '已暂停': 'warning',
  approved: 'success',
  resolved: 'success',
  active: 'success',
  available: 'success',
  '已通过': 'success',
  '已解决': 'success',
  '启用': 'success',
  '在职': 'success',
  '可接单': 'success',
  rejected: 'danger',
  conflict: 'danger',
  failed: 'danger',
  cancelled: 'danger',
  canceled: 'danger',
  unavailable: 'danger',
  '已拒绝': 'danger',
  '有冲突': 'danger',
  '处理失败': 'danger',
  '已取消': 'danger',
  '暂不可接单': 'danger',
  closed: 'neutral',
  inactive: 'neutral',
  '已关闭': 'neutral',
  '停用': 'neutral',
}

export function getStatusBadgeVariant(status: string): NonNullable<StatusBadgeProps['variant']> {
  const normalizedStatus = status.trim().toLocaleLowerCase().replace(/[\s_-]/g, '')
  return STATUS_VARIANTS[normalizedStatus] ?? 'neutral'
}

export function StatusBadge({ label, status = label, variant, size = 'medium', className = '' }: StatusBadgeProps) {
  const resolvedVariant = variant ?? getStatusBadgeVariant(status)
  return <span className={`ui-status-badge ui-status-${resolvedVariant} ui-status-${size}${className ? ` ${className}` : ''}`}>
    <span className="ui-status-dot" aria-hidden="true" />{label}
  </span>
}
