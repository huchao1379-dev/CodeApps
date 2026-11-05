import type { ReactNode } from 'react'

export interface HeaderUser {
  displayName: string
  email?: string
  avatarUrl?: string
}

export interface AppHeaderProps {
  title?: string
  breadcrumbs?: ReactNode
  actions?: ReactNode
  user?: HeaderUser
  onUserMenuClick?: () => void
}
