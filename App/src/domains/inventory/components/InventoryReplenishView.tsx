import { useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  Pagination,
  StatusBadge,
  useOverlayFocus,
  type TableColumn,
} from '../../../shared/components'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  REPLENISHMENT_URGENCY_LABELS,
  type InventoryItem,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type ReplenishmentSuggestion,
  type ReplenishmentUrgency,
} from '../types/inventory.types'

function urgencyVariant(urgency: ReplenishmentUrgency) {
  if (urgency === 'critical') return 'danger' as const
  if (urgency === 'high') return 'warning' as const
  return 'info' as const
}

function orderVariant(status: PurchaseOrderStatus) {
  if (status === 'received') return 'success' as const
  if (status === 'cancelled') return 'neutral' as const
  if (status === 'submitted' || status === 'approved') return 'info' as const
  return 'warning' as const
}

const formatCurrency = (value: number) => new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
}).format(value)

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

const PAGE_SIZE_OPTIONS = [8, 16, 32]

function PurchaseOrderListDialog({
  open,
  purchaseOrders,
  onClose,
  onReceivePurchaseOrder,
  onCancelPurchaseOrder,
}: {
  open: boolean
  purchaseOrders: PurchaseOrder[]
  onClose: () => void
  onReceivePurchaseOrder: (orderId: string) => void
  onCancelPurchaseOrder: (orderId: string) => void
}) {
  const dialogRef = useOverlayFocus<HTMLElement>(open, onClose)
  const [orderPage, setOrderPage] = useState(1)
  const [orderPageSize, setOrderPageSize] = useState(8)

  useEffect(() => {
    if (open) setOrderPage(1)
  }, [open])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(purchaseOrders.length / orderPageSize))
    if (orderPage > maxPage) setOrderPage(maxPage)
  }, [purchaseOrders.length, orderPage, orderPageSize])

  const orderPageCount = Math.max(1, Math.ceil(purchaseOrders.length / orderPageSize))
  const currentOrderPage = Math.min(orderPage, orderPageCount)
  const orderRows = useMemo(() => {
    const start = (currentOrderPage - 1) * orderPageSize
    return purchaseOrders.slice(start, start + orderPageSize)
  }, [purchaseOrders, currentOrderPage, orderPageSize])

  const orderColumns: TableColumn<PurchaseOrder>[] = [
    {
      key: 'status',
      title: '状态',
      width: 110,
      render: (_, order) => (
        <StatusBadge
          status={order.status}
          label={PURCHASE_ORDER_STATUS_LABELS[order.status]}
          variant={orderVariant(order.status)}
          size="small"
        />
      ),
    },
    {
      key: 'number',
      title: '采购单',
      width: 180,
      render: (_, order) => (
        <div className="inventory-name-cell">
          <strong className="inventory-mono">{order.number}</strong>
          <small>{order.requester} · {formatDate(order.createdAt)}</small>
        </div>
      ),
    },
    {
      key: 'lines',
      title: '明细',
      width: 180,
      render: (_, order) => (
        <span className="inventory-muted">
          {order.lines.length} 行 / {order.totalQuantity} 件
          {order.lines[0] ? ` · ${order.lines[0].sku}` : ''}
          {order.lines.length > 1 ? ` 等` : ''}
        </span>
      ),
    },
    {
      key: 'totalAmount',
      title: '金额',
      width: 110,
      render: (_, order) => <strong>{formatCurrency(order.totalAmount)}</strong>,
    },
    {
      key: 'notes',
      title: '备注',
      width: 180,
      render: (_, order) => <span className="inventory-cell-ellipsis" title={order.notes}>{order.notes || '—'}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 180,
      render: (_, order) => (
        <div className="inventory-row-actions" onClick={(event) => event.stopPropagation()}>
          {order.status !== 'received' && order.status !== 'cancelled' && <>
            <button className="button button-primary inventory-mini-button" type="button" onClick={() => onReceivePurchaseOrder(order.id)}>
              收货入库
            </button>
            <button className="button button-quiet inventory-mini-button" type="button" onClick={() => onCancelPurchaseOrder(order.id)}>
              取消
            </button>
          </>}
          {order.status === 'received' && <span className="inventory-muted">已完成</span>}
          {order.status === 'cancelled' && <span className="inventory-muted">已取消</span>}
        </div>
      ),
    },
  ]

  if (!open) return null

  return (
    <div
      className="modal-backdrop inventory-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card inventory-modal-card inventory-po-modal"
        role="dialog"
        aria-modal="true"
        aria-label="采购单列表"
      >
        <header className="modal-header">
          <div>
            <h2>采购单（mock）</h2>
            <p>由补货建议生成；可收货入库或取消</p>
          </div>
          <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" onClick={onClose}>×</button>
        </header>

        <div className="modal-content inventory-po-modal-body">
          <DataTable
            data={orderRows}
            columns={orderColumns}
            rowKey={(order) => order.id}
            ariaLabel="采购单列表"
            emptyTitle="暂无采购单"
            emptyDescription="勾选补货建议后点击「生成采购单」。"
          />

          {purchaseOrders.length > 0 && <footer className="inventory-footer">
            <span>显示 <strong>{(currentOrderPage - 1) * orderPageSize + 1}–{Math.min(currentOrderPage * orderPageSize, purchaseOrders.length)}</strong> / {purchaseOrders.length}</span>
            <Pagination
              page={currentOrderPage}
              pageSize={orderPageSize}
              total={purchaseOrders.length}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={setOrderPage}
              onPageSizeChange={(size) => { setOrderPageSize(size); setOrderPage(1) }}
            />
          </footer>}
        </div>

        <footer className="modal-footer">
          <button className="button button-quiet" type="button" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>
  )
}

export function InventoryReplenishView({
  suggestions,
  items,
  purchaseOrders,
  onReceive,
  onReceiveSuggested,
  onOpenItem,
  onCreatePurchaseOrder,
  onReceivePurchaseOrder,
  onCancelPurchaseOrder,
}: {
  suggestions: ReplenishmentSuggestion[]
  items: InventoryItem[]
  purchaseOrders: PurchaseOrder[]
  onReceive: (item: InventoryItem) => void
  onReceiveSuggested: (item: InventoryItem, quantity: number) => void
  onOpenItem: (item: InventoryItem) => void
  onCreatePurchaseOrder: (itemIds: string[]) => void
  onReceivePurchaseOrder: (orderId: string) => void
  onCancelPurchaseOrder: (orderId: string) => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [suggestionPage, setSuggestionPage] = useState(1)
  const [suggestionPageSize, setSuggestionPageSize] = useState(8)
  const [purchaseOrdersOpen, setPurchaseOrdersOpen] = useState(false)

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => suggestions.some((row) => row.itemId === id)))
  }, [suggestions])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(suggestions.length / suggestionPageSize))
    if (suggestionPage > maxPage) setSuggestionPage(maxPage)
  }, [suggestions.length, suggestionPage, suggestionPageSize])

  const selectedRows = useMemo(
    () => suggestions.filter((row) => selectedIds.includes(row.itemId)),
    [suggestions, selectedIds],
  )
  const selectedCost = selectedRows.reduce((sum, row) => sum + row.estimatedCost, 0)
  const selectedQty = selectedRows.reduce((sum, row) => sum + row.suggestedQty, 0)
  const totalCost = suggestions.reduce((sum, row) => sum + row.estimatedCost, 0)
  const criticalCount = suggestions.filter((row) => row.urgency === 'critical').length
  const allSelected = suggestions.length > 0 && selectedIds.length === suggestions.length

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : suggestions.map((row) => row.itemId))
  }

  const suggestionPageCount = Math.max(1, Math.ceil(suggestions.length / suggestionPageSize))
  const currentSuggestionPage = Math.min(suggestionPage, suggestionPageCount)
  const suggestionRows = useMemo(() => {
    const start = (currentSuggestionPage - 1) * suggestionPageSize
    return suggestions.slice(start, start + suggestionPageSize)
  }, [suggestions, currentSuggestionPage, suggestionPageSize])

  const suggestionColumns: TableColumn<ReplenishmentSuggestion>[] = [
    {
      key: 'urgency',
      title: '紧急度',
      width: 88,
      render: (_, row) => (
        <StatusBadge
          status={row.urgency}
          label={REPLENISHMENT_URGENCY_LABELS[row.urgency]}
          variant={urgencyVariant(row.urgency)}
          size="small"
        />
      ),
    },
    {
      key: 'name',
      title: '物资',
      width: 200,
      render: (_, row) => (
        <div className="inventory-name-cell">
          <strong>{row.name}</strong>
          <small className="inventory-mono">{row.sku} · {row.category}</small>
        </div>
      ),
    },
    { key: 'location', title: '库位', width: 120 },
    {
      key: 'quantity',
      title: '账面 / 可用 / 警戒',
      width: 160,
      render: (_, row) => (
        <span className="inventory-muted inventory-nowrap">
          {row.quantity}{row.unit} / {row.available}{row.unit} / {row.reorderPoint}{row.unit}
        </span>
      ),
    },
    {
      key: 'suggestedQty',
      title: '建议补货',
      width: 110,
      render: (_, row) => (
        <div className="inventory-name-cell">
          <strong className="inventory-suggest-qty">+{row.suggestedQty}{row.unit}</strong>
          <small>{formatCurrency(row.estimatedCost)}</small>
        </div>
      ),
    },
    {
      key: 'reason',
      title: '说明',
      width: 220,
      render: (_, row) => <span className="inventory-cell-ellipsis" title={row.reason}>{row.reason}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 260,
      render: (_, row) => {
        const item = items.find((entry) => entry.id === row.itemId)
        if (!item) return null
        return (
          <div className="inventory-row-actions" onClick={(event) => event.stopPropagation()}>
            <button
              className="button button-primary inventory-mini-button"
              type="button"
              onClick={() => onReceiveSuggested(item, row.suggestedQty)}
            >按建议入库</button>
            <button className="button button-quiet inventory-mini-button" type="button" onClick={() => onReceive(item)}>自定义入库</button>
            <button className="button button-quiet inventory-mini-button" type="button" onClick={() => onOpenItem(item)}>编辑</button>
          </div>
        )
      },
    },
  ]

  return <section className="inventory-panel" aria-label="补货计划">
    <div className="inventory-metrics">
      <article><span>待补货 SKU</span><strong>{suggestions.length}</strong></article>
      <article><span>紧急项</span><strong>{criticalCount}</strong></article>
      <article><span>已选建议</span><strong>{selectedIds.length}</strong></article>
      <article><span>预估采购额</span><strong className="inventory-currency">{formatCurrency(totalCost)}</strong></article>
    </div>

    <section className="inventory-card">
      <header className="inventory-list-header">
        <div className="inventory-list-heading">
          <div>
            <div className="inventory-title-row">
              <h2>智能补货建议</h2>
              <span className="inventory-count">{suggestions.length}</span>
            </div>
            <p>勾选后一键生成 mock 采购单；也可单项直接按建议量入库（库存域独立）</p>
          </div>
          <div className="inventory-toolbar-actions">
            <button className="button button-quiet" type="button" disabled={suggestions.length === 0} onClick={toggleAll}>
              {allSelected ? '取消全选' : '全选建议'}
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => onCreatePurchaseOrder(selectedIds)}
            >
              生成采购单{selectedIds.length > 0 ? `（${selectedIds.length}）` : ''}
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => setPurchaseOrdersOpen(true)}
            >
              采购单{purchaseOrders.length > 0 ? `（${purchaseOrders.length}）` : ''}
            </button>
          </div>
        </div>
      </header>

      {selectedIds.length > 0 && <div className="inventory-selection-banner">
        已选 {selectedIds.length} 项 · 数量 {selectedQty} · 预估 {formatCurrency(selectedCost)}
      </div>}

      <div className="inventory-table-scroll">
        <DataTable
          data={suggestionRows}
          columns={suggestionColumns}
          rowKey={(row) => row.itemId}
          ariaLabel="补货建议列表"
          emptyTitle="暂无补货建议"
          emptyDescription="当前没有低于警戒线或缺货的物资。"
          selectedRowKeys={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      </div>

      {suggestions.length > 0 && <footer className="inventory-footer">
        <span>显示 <strong>{(currentSuggestionPage - 1) * suggestionPageSize + 1}–{Math.min(currentSuggestionPage * suggestionPageSize, suggestions.length)}</strong> / {suggestions.length}</span>
        <Pagination
          page={currentSuggestionPage}
          pageSize={suggestionPageSize}
          total={suggestions.length}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setSuggestionPage}
          onPageSizeChange={(size) => { setSuggestionPageSize(size); setSuggestionPage(1) }}
        />
      </footer>}
    </section>

    <PurchaseOrderListDialog
      open={purchaseOrdersOpen}
      purchaseOrders={purchaseOrders}
      onClose={() => setPurchaseOrdersOpen(false)}
      onReceivePurchaseOrder={onReceivePurchaseOrder}
      onCancelPurchaseOrder={onCancelPurchaseOrder}
    />
  </section>
}
