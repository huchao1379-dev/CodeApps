import type { ReactNode } from 'react'

export interface PageContainerProps {
  title?: string
  description?: string
  eyebrow?: string
  breadcrumbs?: ReactNode
  actions?: ReactNode
  children: ReactNode
  maxWidth?: 'full' | 'wide' | 'normal'
  className?: string
}
