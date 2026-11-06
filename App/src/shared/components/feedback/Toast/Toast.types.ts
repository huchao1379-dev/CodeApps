import type { ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface ToastProps {
  kind: ToastKind
  message: ReactNode
  title?: string
  duration?: number
  onDismiss: () => void
}
