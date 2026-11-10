import { useMemo, useState } from 'react'
import {
  EmptyState,
  StatusBadge,
} from '../../../shared/components'
import {
  STOCKTAKE_STATUS_LABELS,
  STOCKTAKE_VARIANCE_THRESHOLD,
  analyzeStocktakeVariance,
  type StocktakeSession,
  type StocktakeStatus,
} from '../types/inventory.types'

function statusVariant(status: StocktakeStatus) {
  if (status === 'posted') return 'success' as const
  if (status === 'review') return 'warning' as const
  if (status === 'counting') return 'info' as const
  return 'neutral' as const
}

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

export function InventoryStocktakeView({
  sessions,
  busy,
  canStocktake = true,
  canPost = true,
  onStart,
  onCountChange,
  onSubmitReview,
  onRequestPost,
}: {
  sessions: StocktakeSession[]
  busy: boolean
  canStocktake?: boolean
  canPost?: boolean
  onStart: () => void
  onCountChange: (sessionId: string, itemId: string, countedQuantity: number) => void
  onSubmitReview: (sessionId: string) => void
  onRequestPost: (sessionId: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(sessions.find((session) => session.status !== 'posted')?.id ?? sessions[0]?.id ?? null)
  const active = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? sessions[0] ?? null,
    [sessions, activeId],
  )
  const analysis = useMemo(
    () => (active ? analyzeStocktakeVariance(active) : null),
    [active],
  )

  return <section className="inventory-panel" aria-label="库存盘点">
    <section className="inventory-card">
      <header className="inventory-list-header">
        <div className="inventory-list-heading">
          <div>
            <div className="inventory-title-row">
              <h2>库位盘点</h2>
              <span className="inventory-count">{sessions.length}</span>
            </div>
            <p>录入实盘后提交复核；过账前按差异阈值（±{STOCKTAKE_VARIANCE_THRESHOLD}）确认</p>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={!canStocktake}
            title={!canStocktake ? '当前角色无盘点权限' : undefined}
            onClick={onStart}
          >发起盘点</button>
        </div>
      </header>

      {sessions.length === 0
        ? <div className="inventory-empty-pad"><EmptyState title="暂无盘点任务" description="选择库位发起盘点，系统会生成账面快照。" /></div>
        : <div className="inventory-stocktake-list">
          {sessions.map((session) => {
            const summary = analyzeStocktakeVariance(session)
            const variance = session.lines.reduce((sum, line) => {
              if (line.countedQuantity == null) return sum
              return sum + (line.countedQuantity - line.systemQuantity)
            }, 0)
            return <button
              key={session.id}
              type="button"
              className={`inventory-stocktake-card inventory-stocktake-session${active?.id === session.id ? ' is-active' : ''}`}
              onClick={() => setActiveId(session.id)}
            >
              <div className="inventory-stocktake-card-head">
                <strong>{session.number}</strong>
                <StatusBadge status={session.status} label={STOCKTAKE_STATUS_LABELS[session.status]} variant={statusVariant(session.status)} size="small" />
              </div>
              <p>{session.location} · {session.notes}</p>
              <div className="inventory-stocktake-meta">
                <span>{session.operator}</span>
                <span>{session.lines.length} 项</span>
                <span>{summary.pendingCount > 0 ? `未录 ${summary.pendingCount}` : '已录完'}</span>
                <span className={summary.overThreshold.length > 0 ? 'inventory-variance-neg' : undefined}>
                  超阈值 {summary.overThreshold.length}
                </span>
                <span className={variance === 0 ? undefined : variance > 0 ? 'inventory-variance-pos' : 'inventory-variance-neg'}>
                  差异 {variance > 0 ? `+${variance}` : variance}
                </span>
                <span>{formatDate(session.updatedAt)}</span>
              </div>
            </button>
          })}
        </div>}
    </section>

    {active && analysis && <section className="inventory-card">
      <header className="inventory-list-header inventory-stocktake-detail-header">
        <div className="inventory-list-heading">
          <div className="inventory-stocktake-detail-copy">
            <div className="inventory-title-row">
              <h2>{active.number}</h2>
              <StatusBadge status={active.status} label={STOCKTAKE_STATUS_LABELS[active.status]} variant={statusVariant(active.status)} size="small" />
            </div>
            <p className="inventory-stocktake-detail-sub">
              <span>{active.location}</span>
              <span className="inventory-stocktake-dot" aria-hidden="true">·</span>
              <span>开始于 {formatDate(active.startedAt)}</span>
              <span className="inventory-stocktake-dot" aria-hidden="true">·</span>
              <span>阈值 ±{STOCKTAKE_VARIANCE_THRESHOLD}</span>
            </p>
          </div>
          <div className="inventory-toolbar-actions">
            {active.status !== 'posted' && <>
              <button
                className="button button-quiet"
                type="button"
                disabled={busy || !canStocktake}
                title={!canStocktake ? '当前角色无盘点权限' : undefined}
                onClick={() => onSubmitReview(active.id)}
              >提交复核</button>
              <button
                className="button button-primary"
                type="button"
                disabled={busy || !canPost || analysis.pendingCount > 0}
                title={!canPost
                  ? '当前角色无盘点过账权限'
                  : analysis.pendingCount > 0
                    ? '仍有未录入实盘的物资'
                    : undefined}
                onClick={() => onRequestPost(active.id)}
              >过账调整</button>
            </>}
          </div>
        </div>
      </header>

      <div className="inventory-metrics inventory-metrics-compact inventory-stocktake-summary">
        <article><span>未录入</span><strong>{analysis.pendingCount}</strong></article>
        <article><span>差异绝对值</span><strong>{analysis.totalAbsVariance}</strong></article>
        <article><span>阈值内</span><strong>{analysis.withinThreshold.length}</strong></article>
        <article><span>超阈值</span><strong className={analysis.overThreshold.length > 0 ? 'inventory-variance-neg' : undefined}>{analysis.overThreshold.length}</strong></article>
      </div>

      {analysis.overThreshold.length > 0 && <div className="inventory-threshold-banner" role="status">
        有 {analysis.overThreshold.length} 项差异超过 ±{STOCKTAKE_VARIANCE_THRESHOLD}，过账前需二次确认。
      </div>}

      <div className="inventory-stocktake-list">
        {active.lines.map((line) => {
          const counted = line.countedQuantity
          const variance = counted == null ? null : counted - line.systemQuantity
          const over = variance != null && Math.abs(variance) > STOCKTAKE_VARIANCE_THRESHOLD
          return <article
            key={line.itemId}
            className={`inventory-stocktake-card inventory-stocktake-line${over ? ' inventory-stocktake-line-over' : ''}`}
          >
            <div className="inventory-stocktake-card-head">
              <strong>{line.itemName}</strong>
              <div className="inventory-stocktake-line-tags">
                {over && <StatusBadge status="over" label="超阈值" variant="danger" size="small" />}
                <small className="inventory-mono">{line.sku}</small>
              </div>
            </div>
            <div className="inventory-stocktake-line-meta">
              <span className="inventory-stocktake-stat">账面 <b>{line.systemQuantity}{line.unit}</b></span>
              <label className="inventory-stocktake-count-field">
                <span>实盘</span>
                <input
                  className="inventory-count-input"
                  type="number"
                  min={0}
                  disabled={busy || !canStocktake || active.status === 'posted'}
                  title={!canStocktake ? '当前角色无盘点权限' : undefined}
                  value={counted ?? ''}
                  onChange={(event) => onCountChange(active.id, line.itemId, Number(event.target.value))}
                />
              </label>
              <span className={`inventory-stocktake-stat${variance == null || variance === 0 ? '' : variance > 0 ? ' inventory-variance-pos' : ' inventory-variance-neg'}`}>
                {variance == null ? '待录入' : `差异 ${variance > 0 ? `+${variance}` : variance}`}
              </span>
            </div>
          </article>
        })}
      </div>
    </section>}
  </section>
}
