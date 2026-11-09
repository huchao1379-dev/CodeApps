import {
  EmptyState,
  StatusBadge,
} from '../../../shared/components'
import {
  REPLENISHMENT_URGENCY_LABELS,
  type InventoryItem,
  type ReplenishmentSuggestion,
  type ReplenishmentUrgency,
} from '../types/inventory.types'

function urgencyVariant(urgency: ReplenishmentUrgency) {
  if (urgency === 'critical') return 'danger' as const
  if (urgency === 'high') return 'warning' as const
  return 'info' as const
}

const formatCurrency = (value: number) => new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
}).format(value)

export function InventoryReplenishView({
  suggestions,
  items,
  onReceive,
  onReceiveSuggested,
  onOpenItem,
}: {
  suggestions: ReplenishmentSuggestion[]
  items: InventoryItem[]
  onReceive: (item: InventoryItem) => void
  onReceiveSuggested: (item: InventoryItem, quantity: number) => void
  onOpenItem: (item: InventoryItem) => void
}) {
  const totalCost = suggestions.reduce((sum, row) => sum + row.estimatedCost, 0)
  const criticalCount = suggestions.filter((row) => row.urgency === 'critical').length

  return <section className="inventory-panel" aria-label="补货计划">
    <div className="inventory-metrics">
      <article><span>待补货 SKU</span><strong>{suggestions.length}</strong></article>
      <article><span>紧急项</span><strong>{criticalCount}</strong></article>
      <article><span>建议补货总量</span><strong>{suggestions.reduce((sum, row) => sum + row.suggestedQty, 0)}</strong></article>
      <article><span>预估采购额</span><strong className="inventory-currency">{formatCurrency(totalCost)}</strong></article>
    </div>

    <section className="inventory-card">
      <header className="inventory-list-header">
        <div>
          <div className="inventory-title-row"><h2>智能补货建议</h2><span className="inventory-count">{suggestions.length}</span></div>
          <p>按警戒线与可用量生成建议量与估价 — 工单平台无此采购视角</p>
        </div>
      </header>

      {suggestions.length === 0
        ? <div className="inventory-empty-pad"><EmptyState title="暂无补货建议" description="当前没有低于警戒线或缺货的物资。" /></div>
        : <div className="inventory-replenish-list">
          {suggestions.map((row) => {
            const item = items.find((entry) => entry.id === row.itemId)
            return <article key={row.itemId} className={`inventory-replenish-card inventory-replenish-${row.urgency}`}>
              <div className="inventory-replenish-head">
                <div>
                  <StatusBadge
                    status={row.urgency}
                    label={REPLENISHMENT_URGENCY_LABELS[row.urgency]}
                    variant={urgencyVariant(row.urgency)}
                    size="small"
                  />
                  <strong>{row.name}</strong>
                  <small className="inventory-mono">{row.sku} · {row.category}</small>
                </div>
                <div className="inventory-replenish-qty">
                  <span>建议补货</span>
                  <strong>+{row.suggestedQty}{row.unit}</strong>
                  <small>{formatCurrency(row.estimatedCost)}</small>
                </div>
              </div>
              <p>{row.reason}</p>
              <div className="inventory-stocktake-meta">
                <span>库位 {row.location}</span>
                <span>账面 {row.quantity}{row.unit}</span>
                <span>可用 {row.available}{row.unit}</span>
                <span>警戒 {row.reorderPoint}{row.unit}</span>
              </div>
              {item && <div className="inventory-row-actions">
                <button
                  className="button button-primary inventory-mini-button"
                  type="button"
                  onClick={() => onReceiveSuggested(item, row.suggestedQty)}
                >按建议量入库</button>
                <button className="button button-quiet inventory-mini-button" type="button" onClick={() => onReceive(item)}>自定义入库</button>
                <button className="button button-quiet inventory-mini-button" type="button" onClick={() => onOpenItem(item)}>编辑物资</button>
              </div>}
            </article>
          })}
        </div>}
    </section>
  </section>
}
