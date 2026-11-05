import type { ReactNode } from 'react'

export interface ErrorStateProps {
  title?: string
  description: string
  retryLabel?: string
  onRetry?: () => void
  action?: ReactNode
}
