import type { WorkOrderBatchActionInput } from './WorkOrderBatchActionDialog'
import type { BulkResultItem } from '../types/workspace.types'

export interface BulkResultsBannerProps {
  results: BulkResultItem[]
  busy: boolean
  lastBatchInput: WorkOrderBatchActionInput | null
  onRetryFailed: () => void
  onDismiss: () => void
}

export function BulkResultsBanner({
  results,
  busy,
  lastBatchInput,
  onRetryFailed,
  onDismiss,
}: BulkResultsBannerProps) {
  const executed = results.filter((item) => item.success && !item.pendingApproval).length
  const pending = results.filter((item) => item.pendingApproval).length
  const failed = results.filter((item) => !item.success && !item.partial).length
  const partial = results.filter((item) => item.partial).length

  return <section className="bulk-results" role={results.some((item) => !item.success) ? 'alert' : 'status'} aria-label="批量操作结果">
    <header>
      <div>
        <strong>批量操作结果</strong>
        <span>{executed} 已执行 · {pending} 待审批 · {failed} 失败 · {partial} 部分成功</span>
      </div>
      <div className="bulk-results-actions">
        {results.some((item) => !item.success) && lastBatchInput && (
          <button className="button button-quiet" type="button" disabled={busy} onClick={onRetryFailed}>仅重试失败项</button>
        )}
        <button className="icon-button" type="button" aria-label="关闭批量操作结果" onClick={onDismiss}>×</button>
      </div>
    </header>
    <ul>
      {results.map((result) => (
        <li
          key={result.workOrder.id}
          className={result.partial
            ? 'bulk-result-partial'
            : result.pendingApproval
              ? 'bulk-result-pending'
              : result.success
                ? 'bulk-result-success'
                : 'bulk-result-failure'}
        >
          <strong>{result.workOrder.workOrderNumber || result.workOrder.workOrderName}</strong>
          <span>{result.message}</span>
        </li>
      ))}
    </ul>
  </section>
}
