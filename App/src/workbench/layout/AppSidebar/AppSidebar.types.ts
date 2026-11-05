import type { ReactNode } from 'react'

export interface NavigationItem {
  id: string
  label: string
  path?: string
  icon?: ReactNode
  badge?: ReactNode
  children?: NavigationItem[]
  disabled?: boolean
}

export interface NavigationGroup {
  id: string
  label?: string
  items: NavigationItem[]
}

export interface AppSidebarProps {
  items: NavigationGroup[]
  activePath: string
  collapsed?: boolean
  onNavigate: (path: string) => void
  onCollapseChange?: (collapsed: boolean) => void
  brand?: ReactNode
  workspace?: ReactNode
  footer?: ReactNode
}
