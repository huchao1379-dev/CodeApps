import { useContext } from 'react'
import type { NavigationItem, AppSidebarProps } from './AppSidebar.types'
import { SidebarCollapseContext } from '../SidebarCollapseContext'

function containsActive(item: NavigationItem, activePath: string): boolean {
  return (item.path ?? item.id) === activePath || Boolean(item.children?.some((child) => containsActive(child, activePath)))
}

function SidebarItem({ item, activePath, collapsed, onNavigate, depth = 0 }: {
  item: NavigationItem
  activePath: string
  collapsed: boolean
  onNavigate: (path: string) => void
  depth?: number
}) {
  const path = item.path ?? item.id
  const active = path === activePath
  const parentActive = containsActive(item, activePath)
  return <div className="wb-nav-entry">
    <button className={`wb-nav-item${active ? ' wb-nav-active' : ''}${parentActive ? ' wb-nav-parent-active' : ''}`}
      type="button" title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined}
      disabled={item.disabled} onClick={() => onNavigate(path)} style={{ paddingInlineStart: collapsed ? undefined : 12 + depth * 14 }}>
      {item.icon && <span className="wb-nav-icon" aria-hidden="true">{item.icon}</span>}
      <span className="wb-nav-label">{item.label}</span>
      {item.badge !== undefined && <span className="wb-nav-badge">{item.badge}</span>}
    </button>
    {!collapsed && item.children && item.children.length > 0 && <div className="wb-nav-children">
      {item.children.map((child) => <SidebarItem key={child.id} item={child} activePath={activePath} collapsed={collapsed} onNavigate={onNavigate} depth={depth + 1} />)}
    </div>}
  </div>
}

export function AppSidebar({ items, activePath, collapsed = false, onNavigate, onCollapseChange, brand, workspace, footer }: AppSidebarProps) {
  const layoutCollapseChange = useContext(SidebarCollapseContext)
  const handleCollapseChange = onCollapseChange ?? layoutCollapseChange
  return <aside className={`wb-sidebar${collapsed ? ' wb-sidebar-collapsed' : ''}`}>
    <div className="wb-sidebar-brand">{brand}</div>
    {!collapsed && workspace && <div className="wb-sidebar-workspace">{workspace}</div>}
    <nav className="wb-sidebar-nav" aria-label="主导航">
      {items.map((group) => <section className="wb-nav-group" key={group.id}>
        {!collapsed && group.label && <h2 className="wb-nav-caption">{group.label}</h2>}
        {group.items.map((item) => <SidebarItem key={item.id} item={item} activePath={activePath} collapsed={collapsed} onNavigate={onNavigate} />)}
      </section>)}
    </nav>
    <div className="wb-sidebar-footer">{footer}</div>
    {handleCollapseChange && <button className="wb-collapse-button" type="button" aria-label={collapsed ? '展开导航' : '收起导航'}
      title={collapsed ? '展开导航' : '收起导航'} onClick={() => handleCollapseChange(!collapsed)}>{collapsed ? '›' : '‹'}</button>}
  </aside>
}
