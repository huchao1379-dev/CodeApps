import type { LoadingStateProps } from './LoadingState.types'

export function LoadingState({ label = '正在加载…', size = 'medium', fullPage = false }: LoadingStateProps) {
  return <div className={`ui-state ui-state-loading${fullPage ? ' ui-state-full-page' : ''}`} role="status" aria-live="polite">
    <span className={`ui-spinner ui-spinner-${size}`} aria-hidden="true" />
    <span className="ui-state-description">{label}</span>
  </div>
}
