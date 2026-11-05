import type { AppHeaderProps } from './AppHeader.types'

export function AppHeader({ title, breadcrumbs, actions, user, onUserMenuClick }: AppHeaderProps) {
  return <header className="wb-header">
    <div className="wb-header-context">{breadcrumbs ?? (title && <h1 className="wb-header-title">{title}</h1>)}</div>
    <div className="wb-header-actions">
      {actions}
      {user && <button className="wb-user-button" type="button" onClick={onUserMenuClick} disabled={!onUserMenuClick} aria-label={`用户：${user.displayName}`}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span aria-hidden="true">{user.displayName.slice(0, 1)}</span>}
        <span className="wb-user-name">{user.displayName}</span>
      </button>}
    </div>
  </header>
}
