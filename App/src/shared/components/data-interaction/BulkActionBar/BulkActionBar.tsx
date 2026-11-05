import type { BulkActionBarProps } from './BulkActionBar.types'

export function BulkActionBar({ selectedCount, actions, onAction, onClear, busy = false }: BulkActionBarProps) {
  if (selectedCount < 1) return null
  return <div className="ui-bulk-action-bar" role="toolbar" aria-label="批量工单操作">
    <strong className="ui-bulk-count">已选择 {selectedCount} 项</strong>
    <div className="ui-bulk-actions">{actions.map((action) => <button key={action.id} type="button" className="ui-bulk-action"
      disabled={busy || action.disabled} onClick={() => onAction(action.id)}>
      {action.icon && <span aria-hidden="true">{action.icon}</span>}{action.label}
    </button>)}</div>
    <button type="button" className="ui-bulk-clear" disabled={busy} onClick={onClear}>取消选择</button>
  </div>
}
