import { useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  Pagination,
  StatusBadge,
  type TableColumn,
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

const PAGE_SIZE_OPTIONS = [8, 16, 32]

function AlertTable({
  title,
  description,
  alerts,
  items,
  ariaLabel,
  emptyTitle,
  emptyDescription,
  onReplenish,
  onOpenItem,
  showReplenish,
  canReplenish = true,
  canEdit = true,
}: {
  title: string
  description: string
  alerts: InventoryAlert[]
  items: InventoryItem[]
  ariaLabel: string
  emptyTitle: string
  emptyDescription: string
  onReplenish: (item: InventoryItem) => void
  onOpenItem: (item: InventoryItem) => void
  showReplenish: boolean
  canReplenish?: boolean
  canEdit?: boolean
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)

  useEffect(() => {
    setPage(1)
  }, [alerts])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(alerts.length / pageSize))
    if (page > maxPage) setPage(maxPage)
  }, [alerts.length, page, pageSize])

  const pageCount = Math.max(1, Math.ceil(alerts.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return alerts.slice(start, start + pageSize)
  }, [alerts, currentPage, pageSize])

  const columns: TableColumn<InventoryAlert>[] = [
    {
      key: 'kind',
      title: '类型',
      width: 100,
      render: (_, alert) => (
        <StatusBadge
          status={alert.kind}
          label={INVENTORY_ALERT_LABELS[alert.kind]}
          variant={severityVariant(alert.severity)}
          size="small"
        />
      ),
    },
    {
      key: 'title',
      title: '预警',
      width: 180,
      render: (_, alert) => (
        <div className="inventory-name-cell">
          <strong>{alert.title}</strong>
          <small className="inventory-cell-ellipsis" title={alert.description}>{alert.description}</small>
        </div>
      ),
    },
    {
      key: 'location',
      title: '库位',
      width: 110,
      render: (_, alert) => alert.location || '—',
    },
    {
      key: 'occurredAt',
      title: '时间',
      width: 140,
      render: (_, alert) => (
        <span className="inventory-muted">
          {new Date(alert.occurredAt).toLocaleString('zh-CN', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 160,
      render: (_, alert) => {
        const item = alert.itemId ? items.find((entry) => entry.id === alert.itemId) ?? null : null
        if (!item) return <span className="inventory-muted">—</span>
        return (
          <div className="inventory-row-actions" onClick={(event) => event.stopPropagation()}>
            {showReplenish && (alert.kind === 'out' || alert.kind === 'low') && (
              <button
                className="button button-primary inventory-mini-button"
                type="button"
                disabled={!canReplenish}
                title={!canReplenish ? '当前角色无入库权限' : undefined}
                onClick={() => onReplenish(item)}
              >
                补货
              </button>
            )}
            <button
              className="button button-quiet inventory-mini-button"
              type="button"
              disabled={!canEdit}
              title={!canEdit ? '当前角色无编辑权限' : undefined}
              onClick={() => onOpenItem(item)}
            >
              查看
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <section className="inventory-card inventory-alert-panel">
      <header className="inventory-list-header">
        <div>
          <div className="inventory-title-row">
            <h2>{title}</h2>
            <span className="inventory-count">{alerts.length}</span>
          </div>
          <p>{description}</p>
        </div>
      </header>

      <div className="inventory-table-scroll">
        <DataTable
          data={pageRows}
          columns={columns}
          rowKey={(alert) => alert.id}
          ariaLabel={ariaLabel}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
        />
      </div>

      {alerts.length > 0 && <footer className="inventory-footer">
        <span>显示 <strong>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, alerts.length)}</strong> / {alerts.length}</span>
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={alerts.length}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      </footer>}
    </section>
  )
}

export function InventoryAlertsView({
  alerts,
  items,
  canReplenish = true,
  canEdit = true,
  onReplenish,
  onOpenItem,
}: {
  alerts: InventoryAlert[]
  items: InventoryItem[]
  canReplenish?: boolean
  canEdit?: boolean
  onReplenish: (item: InventoryItem) => void
  onOpenItem: (item: InventoryItem) => void
}) {
  const expiryAlerts = useMemo(
    () => alerts.filter((alert) => alert.kind === 'expiring' || alert.kind === 'expired'),
    [alerts],
  )
  const stockAlerts = useMemo(
    () => alerts.filter((alert) => alert.kind === 'out' || alert.kind === 'low' || alert.kind === 'overstock'),
    [alerts],
  )

  return (
    <div className="inventory-alert-split" aria-label="补货与效期预警">
      <AlertTable
        title="临期内容"
        description="批次临期与过期预警，优先处理效期风险"
        alerts={expiryAlerts}
        items={items}
        ariaLabel="临期预警列表"
        emptyTitle="暂无临期预警"
        emptyDescription="当前没有临期或过期批次。"
        onReplenish={onReplenish}
        onOpenItem={onOpenItem}
        showReplenish={false}
        canReplenish={canReplenish}
        canEdit={canEdit}
      />
      <AlertTable
        title="低于警戒线"
        description="缺货、低于警戒线与库位超容，聚焦库存水位"
        alerts={stockAlerts}
        items={items}
        ariaLabel="警戒线预警列表"
        emptyTitle="暂无警戒预警"
        emptyDescription="当前没有低于警戒线或缺货项。"
        onReplenish={onReplenish}
        onOpenItem={onOpenItem}
        showReplenish
        canReplenish={canReplenish}
        canEdit={canEdit}
      />
    </div>
  )
}
