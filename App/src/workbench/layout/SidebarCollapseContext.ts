import { createContext } from 'react'

export const SidebarCollapseContext = createContext<((collapsed: boolean) => void) | undefined>(undefined)
