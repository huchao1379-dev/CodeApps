import { useEffect, useId, useRef } from 'react'
import { LoadingState } from '../../feedback/LoadingState'
import { useBodyScrollLock } from '../useBodyScrollLock'
import { useOverlayFocus } from '../useOverlayFocus'
import type { DetailPanelProps } from './DetailPanel.types'

export function DetailPanel({ open, title = '详情', subtitle, size = 'medium', children, footer, loading = false, onClose }: DetailPanelProps) {
  const titleId = useId()
  const panelRef = useOverlayFocus<HTMLElement>(open, onClose)
  const backdropRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return undefined
    const backdrop = backdropRef.current
    if (!backdrop) return undefined

    const shouldAllowScroll = (target: EventTarget | null) => {
      const node = target instanceof Node ? target : null
      const content = contentRef.current
      return Boolean(node && content && content.contains(node))
    }

    const blockBackgroundScroll = (event: WheelEvent | TouchEvent) => {
      if (shouldAllowScroll(event.target)) return
      event.preventDefault()
    }

    backdrop.addEventListener('wheel', blockBackgroundScroll, { passive: false })
    backdrop.addEventListener('touchmove', blockBackgroundScroll, { passive: false })
    return () => {
      backdrop.removeEventListener('wheel', blockBackgroundScroll)
      backdrop.removeEventListener('touchmove', blockBackgroundScroll)
    }
  }, [open])

  if (!open) return null

  return <div ref={backdropRef} className="ui-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside ref={panelRef} tabIndex={-1} className={`ui-detail-panel ui-detail-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="ui-detail-header">
        <div className="ui-detail-heading"><h2 className="ui-detail-title" id={titleId}>{title}</h2>{subtitle && <p className="ui-detail-subtitle">{subtitle}</p>}</div>
        <button data-overlay-initial-focus className="ui-detail-close" type="button" aria-label="关闭详情" onClick={onClose}>×</button>
      </header>
      <div ref={contentRef} className="ui-detail-content">{loading ? <LoadingState /> : children}</div>
      {footer && <footer className="ui-detail-footer">{footer}</footer>}
    </aside>
  </div>
}
