import type { EmptyStateProps } from './EmptyState.types'

export function EmptyState({ title = '暂无数据', description, icon = '○', action }: EmptyStateProps) {
  return <div className="ui-state" role="status">
    <span className="ui-state-icon" aria-hidden="true">{icon}</span>
    <h3 className="ui-state-title">{title}</h3>
    {description && <p className="ui-state-description">{description}</p>}
    {action && <div className="ui-state-action">{action}</div>}
  </div>
}
