import type { StatusBadgeProps } from './StatusBadge.types'

export function StatusBadge({ label, variant = 'neutral', size = 'medium', className = '' }: StatusBadgeProps) {
  return <span className={`ui-status-badge ui-status-${variant} ui-status-${size}${className ? ` ${className}` : ''}`}>
    <span className="ui-status-dot" aria-hidden="true" />{label}
  </span>
}
