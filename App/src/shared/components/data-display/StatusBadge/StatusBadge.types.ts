export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface StatusBadgeProps {
  label: string
  variant?: BadgeVariant
  size?: 'small' | 'medium'
  className?: string
}
