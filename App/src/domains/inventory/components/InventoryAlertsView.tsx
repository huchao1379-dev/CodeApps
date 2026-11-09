import {
  EmptyState,
  StatusBadge,
} from '../../../shared/components'
import {
  INVENTORY_ALERT_LABELS,
  type InventoryAlert,
  type InventoryItem,
} from '../types/inventory.types'

function severityVariant(severity: InventoryAlert['severity']) {
  if (severity === 'critical') return 'danger' as const
  if (severity === 'high') return 'warning' as const
  return 'info' as const
}

export function InventoryAlertsView({
  alerts,
  items,
  onReplenish,
  onOpenItem,
}: {
  alerts: InventoryAlert[]
  items: InventoryItem[]
  onReplenish: (item: InventoryItem) => void
  onOpenItem: (item: InventoryItem) => void
}) {
  return <section className="inventory-card" aria-label="补货与效期预警">
    <header className="inventory-list-header">
      <div className="inventory-list-heading">
        <div>
          <div className="inventory-title-row"><h2>库存预警中心</h2><span className="inventory-count">{alerts.length}</span></div>
          <p>区别于工单平台：聚焦缺货、警戒线、批次临期/过期与库位超容</p>
        </div>
      </div>
    </header>

    {alerts.length === 0
      ? <div className="inventory-empty-pad"><EmptyState title="暂无预警" description="当前库存与批次状态健康。" /></div>
      : <div className="inventory-alert-list">
        {alerts.map((alert) => {
          const item = alert.itemId ? items.find((entry) => entry.id === alert.itemId) ?? null : null
          return <article key={alert.id} className={`inventory-alert-card inventory-alert-card-${alert.severity}`}>
            <div className="inventory-alert-card-head">
              <StatusBadge
                status={alert.kind}
                label={INVENTORY_ALERT_LABELS[alert.kind]}
                variant={severityVariant(alert.severity)}
                size="small"
              />
              <strong>{alert.title}</strong>
            </div>
            <p>{alert.description}</p>
            <div className="inventory-alert-meta">
              {alert.location && <span>库位 {alert.location}</span>}
              <span>{new Date(alert.occurredAt).toLocaleString('zh-CN')}</span>
            </div>
            {item && <div className="inventory-row-actions">
              {(alert.kind === 'out' || alert.kind === 'low') && (
                <button className="button button-primary inventory-mini-button" type="button" onClick={() => onReplenish(item)}>
                  一键补货入库
                </button>
              )}
              <button className="button button-quiet inventory-mini-button" type="button" onClick={() => onOpenItem(item)}>
                查看物资
              </button>
            </div>}
          </article>
        })}
      </div>}
  </section>
}
