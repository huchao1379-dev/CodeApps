import type { AppLayoutProps } from './AppLayout.types'
import { SidebarCollapseContext } from '../SidebarCollapseContext'
import '../workbench-layout.css'

export function AppLayout({ sidebar, header, children, sidebarCollapsed = false, onSidebarCollapseChange }: AppLayoutProps) {
  return <SidebarCollapseContext.Provider value={onSidebarCollapseChange}>
    <div className={`wb-layout${sidebarCollapsed ? ' wb-layout-collapsed' : ''}`}>
      {sidebar}
      <main className="wb-main">
        {header}
        <div className="wb-main-content">{children}</div>
      </main>
    </div>
  </SidebarCollapseContext.Provider>
}
