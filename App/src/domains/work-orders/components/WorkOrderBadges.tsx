import { StatusBadge } from '../../../shared/components'
import { PRIORITY, PRIORITY_LABELS, STATUS_LABELS, type Priority, type WorkOrderStatus } from '../types/workOrder.types'

const priorityClass: Record<Priority, string> = {
  [PRIORITY.low]: 'low',
  [PRIORITY.medium]: 'medium',
  [PRIORITY.high]: 'high',
  [PRIORITY.critical]: 'critical',
}

export function StatusPill({ status }: { status: WorkOrderStatus }) {
  return <StatusBadge status={STATUS_LABELS[status]} label={STATUS_LABELS[status]} size="small" />
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return <span className={`priority-label priority-${priorityClass[priority]}`}><i />{PRIORITY_LABELS[priority]}</span>
}

export function Avatar({ name, small = false }: { name: string | null; small?: boolean }) {
  if (!name) return <span className={`avatar avatar-empty${small ? ' avatar-small' : ''}`}>待</span>
  return <span className={`avatar${small ? ' avatar-small' : ''}`}>{name.slice(-1)}</span>
}

export function MetricCard({
  label,
  value,
  detail,
  tone,
  active = false,
  onClick,
}: {
  label: string
  value: number
  detail: string
  tone: string
  active?: boolean
  onClick?: () => void
}) {
  const interactive = Boolean(onClick)
  const className = `metric-card${interactive ? ' metric-card-interactive' : ''}${active ? ' is-active' : ''}`
  const icon = tone === 'purple' ? '▦' : tone === 'amber' ? '◷' : tone === 'blue' ? '↗' : '✓'
  if (!interactive) {
    return <article className={className}>
      <div className={`metric-icon metric-${tone}`}>{icon}</div>
      <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
      <span className={`metric-spark spark-${tone}`} aria-hidden="true">⌁</span>
    </article>
  }
  return <button type="button" className={className} aria-pressed={active} onClick={onClick}>
    <div className={`metric-icon metric-${tone}`}>{icon}</div>
    <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    <span className={`metric-spark spark-${tone}`} aria-hidden="true">⌁</span>
  </button>
}
