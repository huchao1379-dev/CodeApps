import type { ReactNode } from 'react'

export interface AppLayoutProps {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
  sidebarCollapsed?: boolean
  onSidebarCollapseChange?: (collapsed: boolean) => void
}
