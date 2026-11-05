import type { ReactNode } from 'react'

export type PanelSize = 'small' | 'medium' | 'large'

export interface DetailPanelProps {
  open: boolean
  title?: string
  subtitle?: string
  size?: PanelSize
  children: ReactNode
  footer?: ReactNode
  loading?: boolean
  onClose: () => void
}
