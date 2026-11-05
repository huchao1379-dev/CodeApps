import { useId } from 'react'
import { LoadingState } from '../../feedback/LoadingState'
import { useOverlayFocus } from '../useOverlayFocus'
import type { DetailPanelProps } from './DetailPanel.types'

export function DetailPanel({ open, title = '详情', subtitle, size = 'medium', children, footer, loading = false, onClose }: DetailPanelProps) {
  const titleId = useId()
  const panelRef = useOverlayFocus<HTMLElement>(open, onClose)

  if (!open) return null

  return <div className="ui-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside ref={panelRef} tabIndex={-1} className={`ui-detail-panel ui-detail-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="ui-detail-header">
        <div className="ui-detail-heading"><h2 className="ui-detail-title" id={titleId}>{title}</h2>{subtitle && <p className="ui-detail-subtitle">{subtitle}</p>}</div>
        <button data-overlay-initial-focus className="ui-detail-close" type="button" aria-label="关闭详情" onClick={onClose}>×</button>
      </header>
      <div className="ui-detail-content">{loading ? <LoadingState /> : children}</div>
      {footer && <footer className="ui-detail-footer">{footer}</footer>}
    </aside>
  </div>
}
