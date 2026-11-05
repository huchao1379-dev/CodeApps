import type { ErrorStateProps } from './ErrorState.types'

export function ErrorState({ title = '读取失败', description, retryLabel = '重试', onRetry, action }: ErrorStateProps) {
  return <div className="ui-state ui-state-error" role="alert">
    <span className="ui-state-icon" aria-hidden="true">!</span>
    <h3 className="ui-state-title">{title}</h3>
    <p className="ui-state-description">{description}</p>
    {(action || onRetry) && <div className="ui-state-action">
      {action ?? <button className="ui-filter-button" type="button" onClick={onRetry}>{retryLabel}</button>}
    </div>}
  </div>
}
