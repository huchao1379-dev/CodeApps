import { useContext, useState } from 'react'
import type { NavigationItem, AppSidebarProps } from './AppSidebar.types'
import { SidebarCollapseContext } from '../SidebarCollapseContext'

function containsActive(item: NavigationItem, activePath: string): boolean {
  return (item.path ?? item.id) === activePath || Boolean(item.children?.some((child) => containsActive(child, activePath)))
}

function SidebarItem({ item, activePath, collapsed, expandedIds, onToggleExpand, onNavigate, depth = 0 }: {
  item: NavigationItem
  activePath: string
  collapsed: boolean
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onNavigate: (path: string) => void
  depth?: number
}) {
  const path = item.path ?? item.id
  const active = path === activePath
  const parentActive = containsActive(item, activePath)
  const hasChildren = Boolean(item.children && item.children.length > 0)
  const childActive = Boolean(item.children?.some((child) => containsActive(child, activePath)))
  // 默认收起；手动点开，或当前正落在子菜单时自动展开
  const isExpanded = !collapsed && hasChildren && (expandedIds.has(item.id) || childActive)

  const handleClick = () => {
    if (hasChildren && !collapsed) {
      onToggleExpand(item.id)
      return
    }
    onNavigate(hasChildren ? (item.children?.[0]?.path ?? path) : path)
  }

  return <div className={`wb-nav-entry${hasChildren ? ' wb-nav-entry-branch' : ''}${isExpanded ? ' is-expanded' : ''}`}>
    <button className={`wb-nav-item${active ? ' wb-nav-active' : ''}${parentActive && !active ? ' wb-nav-parent-active' : ''}`}
      type="button" title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined}
      aria-expanded={hasChildren ? isExpanded : undefined}
      disabled={item.disabled} onClick={handleClick}
      style={{ paddingInlineStart: collapsed ? undefined : 12 + depth * 14 }}>
      {item.icon && <span className="wb-nav-icon" aria-hidden="true">{item.icon}</span>}
      <span className="wb-nav-label">{item.label}</span>
      {item.badge !== undefined && <span className="wb-nav-badge">{item.badge}</span>}
      {hasChildren && !collapsed && <span className={`wb-nav-chevron${isExpanded ? ' is-open' : ''}`} aria-hidden="true">›</span>}
    </button>
    {isExpanded && item.children && <div className="wb-nav-children" role="group" aria-label={`${item.label}子菜单`}>
      {item.children.map((child) => <SidebarItem key={child.id} item={child} activePath={activePath} collapsed={collapsed}
        expandedIds={expandedIds} onToggleExpand={onToggleExpand} onNavigate={onNavigate} depth={depth + 1} />)}
    </div>}
  </div>
}

export function AppSidebar({ items, activePath, collapsed = false, onNavigate, onCollapseChange, brand, workspace, footer }: AppSidebarProps) {
  const layoutCollapseChange = useContext(SidebarCollapseContext)
  const handleCollapseChange = onCollapseChange ?? layoutCollapseChange
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return <aside className={`wb-sidebar${collapsed ? ' wb-sidebar-collapsed' : ''}`}>
    <div className="wb-sidebar-brand">{brand}</div>
    {!collapsed && workspace && <div className="wb-sidebar-workspace">{workspace}</div>}
    <nav className="wb-sidebar-nav" aria-label="主导航">
      {items.map((group) => <section className="wb-nav-group" key={group.id}>
        {!collapsed && group.label && <h2 className="wb-nav-caption">{group.label}</h2>}
        {group.items.map((item) => <SidebarItem key={item.id} item={item} activePath={activePath} collapsed={collapsed}
          expandedIds={expandedIds} onToggleExpand={toggleExpand} onNavigate={onNavigate} />)}
      </section>)}
    </nav>
    <div className="wb-sidebar-footer">{footer}</div>
    {handleCollapseChange && <button className="wb-collapse-button" type="button" aria-label={collapsed ? '展开导航' : '收起导航'}
      title={collapsed ? '展开导航' : '收起导航'} onClick={() => handleCollapseChange(!collapsed)}>
      <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
    </button>}
  </aside>
}
