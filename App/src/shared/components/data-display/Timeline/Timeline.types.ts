import type { ReactNode } from 'react'

export type TimelineTone = 'default' | 'created' | 'status-change' | 'assignment-change' | 'info' | 'warning' | 'success'

export interface TimelineItem {
  id: string
  title: string
  description?: ReactNode
  meta?: ReactNode
  time?: ReactNode
  tone?: TimelineTone | string
}

export interface TimelineProps {
  items: TimelineItem[]
  emptyLabel?: string
  ariaLabel?: string
}
