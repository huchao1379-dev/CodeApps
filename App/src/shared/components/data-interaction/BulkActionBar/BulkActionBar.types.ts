import type { ReactNode } from 'react'

export interface BulkAction {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

export interface BulkActionBarProps {
  selectedCount: number
  actions: BulkAction[]
  onAction: (actionId: string) => void
  onClear: () => void
  busy?: boolean
}
