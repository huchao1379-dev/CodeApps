import { useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  DetailPanel,
  FilterBar,
  Pagination,
  SearchInput,
  StatusBadge,
  type FilterDefinition,
  type TableColumn,
} from '../../../shared/components'
import {
  INVENTORY_BATCH_STATUS_LABELS,
  type InventoryBatch,
  type InventoryBatchStatus,
  type InventoryItem,
} from '../types/inventory.types'

function batchVariant(status: InventoryBatchStatus) {
  if (status === 'expired') return 'danger' as const
  if (status === 'expiring') return 'warning' as const
  if (status === 'depleted') return 'neutral' as const
  return 'success' as const
}

const formatDate = (value: string | null) => {
  if (!value) return '无限期'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(value))
}

function daysUntilExpiry(expiresAt: string | null) {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.ceil(diff / (24 * 60 * 60 * 1000))
}

const PAGE_SIZE_OPTIONS = [8, 16, 32]

export function InventoryBatchesView({
  batches,
  items,
  locations,
  onIssuePrefer,
  onReceive,
  onOpenItem,
}: {
  batches: InventoryBatch[]
  items: InventoryItem[]
  locations: string[]
  onIssuePrefer: (batch: InventoryBatch) => void
  onReceive: (item: InventoryItem) => void
  onOpenItem: (item: InventoryItem) => void
}) {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase()
    return batches.filter((batch) => {
      if (statusFilter !== 'all' && batch.status !== statusFilter) return false
      if (locationFilter !== 'all' && batch.location !== locationFilter) return false
      if (!normalized) return true
      return [batch.lotNumber, batch.sku, batch.itemName, batch.supplier, batch.location]
        .some((value) => value.toLocaleLowerCase().includes(normalized))
    })
  }, [batches, search, statusFilter, locationFilter])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, locationFilter])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize))
    if (page > maxPage) setPage(maxPage)
  }, [filtered.length, page, pageSize])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? null
  const selectedItem = selectedBatch
    ? items.find((item) => item.id === selectedBatch.itemId) ?? null
    : null

  const filterDefinitions: FilterDefinition[] = [
    {
      key: 'status',
      label: '批次状态',
      type: 'select',
      options: [
        { value: 'all', label: '全部状态' },
        ...Object.entries(INVENTORY_BATCH_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      ],
    },
    {
      key: 'location',
      label: '库位',
      type: 'select',
      options: [
        { value: 'all', label: '全部库位' },
        ...locations.map((location) => ({ value: location, label: location })),
      ],
    },
  ]

  const stats = useMemo(() => ({
    active: batches.filter((batch) => batch.status === 'active').length,
    expiring: batches.filter((batch) => batch.status === 'expiring').length,
    expired: batches.filter((batch) => batch.status === 'expired').length,
    depleted: batches.filter((batch) => batch.status === 'depleted').length,
  }), [batches])

  const clearFilters = () => {
    setQuery('')
    setSearch('')
    setStatusFilter('all')
    setLocationFilter('all')
    setPage(1)
  }

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== 'all' || locationFilter !== 'all'

  const columns: TableColumn<InventoryBatch>[] = [
    {
      key: 'status',
      title: '状态',
      width: 88,
      render: (_, batch) => (
        <StatusBadge
          status={batch.status}
          label={INVENTORY_BATCH_STATUS_LABELS[batch.status]}
          variant={batchVariant(batch.status)}
          size="small"
        />
      ),
    },
    {
      key: 'lotNumber',
      title: '批号',
      width: 160,
      render: (_, batch) => (
        <div className="inventory-name-cell">
          <strong className="inventory-mono">{batch.lotNumber}</strong>
          <small>{batch.itemName} · {batch.sku}</small>
        </div>
      ),
    },
    { key: 'location', title: '库位', width: 120 },
    { key: 'supplier', title: '供应商', width: 120 },
    {
      key: 'quantity',
      title: '在库',
      width: 80,
      render: (_, batch) => <strong>{batch.quantity}</strong>,
    },
    {
      key: 'receivedAt',
      title: '收货',
      width: 110,
      render: (_, batch) => formatDate(batch.receivedAt),
    },
    {
      key: 'expiresAt',
      title: '到期',
      width: 150,
      render: (_, batch) => {
        const days = daysUntilExpiry(batch.expiresAt)
        let suffix = ''
        if (days != null && days >= 0 && days <= 30) suffix = `（${days} 天）`
        if (days != null && days < 0) suffix = `（已过期 ${Math.abs(days)} 天）`
        return <span>{formatDate(batch.expiresAt)}{suffix}</span>
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 200,
      render: (_, batch) => (
        <div className="inventory-row-actions" onClick={(event) => event.stopPropagation()}>
          <button
            className="button button-quiet inventory-mini-button"
            type="button"
            onClick={() => setSelectedBatchId(batch.id)}
          >详情</button>
          {(batch.status === 'expiring' || batch.status === 'expired') && batch.quantity > 0 && (
            <button
              className="button button-primary inventory-mini-button"
              type="button"
              onClick={() => onIssuePrefer(batch)}
            >
              {batch.status === 'expired' ? '隔离出库' : '临期领用'}
            </button>
          )}
        </div>
      ),
    },
  ]

  return <section className="inventory-panel" aria-label="批次效期">
    <div className="inventory-metrics inventory-metrics-compact" role="toolbar" aria-label="批次状态快捷筛选">
      {([
        { key: 'all', label: '全部批次', value: batches.length, tone: 'neutral' },
        { key: 'active', label: '有效', value: stats.active, tone: 'in' },
        { key: 'expiring', label: '临期', value: stats.expiring, tone: 'out' },
        { key: 'expired', label: '过期', value: stats.expired, tone: 'adjust' },
        { key: 'depleted', label: '已耗尽', value: stats.depleted, tone: 'transfer' },
      ] as const).map((metric) => <button
        key={metric.key}
        type="button"
        className={`inventory-metric-chip inventory-metric-${metric.tone}${statusFilter === metric.key ? ' is-active' : ''}`}
        onClick={() => { setStatusFilter(metric.key); setPage(1) }}
      >
        <span>{metric.label}</span>
        <strong>{metric.value}</strong>
      </button>)}
    </div>

    <section className="inventory-card">
      <header className="inventory-list-header inventory-list-header-stack">
        <div className="inventory-list-heading">
          <div>
            <div className="inventory-title-row"><h2>批次与效期台账</h2><span className="inventory-count">{filtered.length}</span></div>
            <p>点击批次查看详情并跳转物资操作；支持批号 / SKU / 供应商 / 库位检索</p>
          </div>
          {hasActiveFilters && (
            <button className="button button-quiet inventory-mini-button" type="button" onClick={clearFilters}>
              重置全部筛选
            </button>
          )}
        </div>

        <div className="inventory-toolbar inventory-batch-toolbar">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value)
              setSearch(value)
            }}
            onSearch={setSearch}
            onClear={() => { setQuery(''); setSearch('') }}
            placeholder="搜索批号、SKU、供应商或库位"
            ariaLabel="搜索批次"
          />
          <FilterBar
            definitions={filterDefinitions}
            values={{ status: statusFilter, location: locationFilter }}
            onChange={(next) => {
              setStatusFilter(String(next.status ?? 'all'))
              setLocationFilter(String(next.location ?? 'all'))
            }}
            onReset={clearFilters}
            resetLabel="清除筛选"
          />
        </div>
      </header>

      <div className="inventory-table-scroll">
        <DataTable
          data={pageRows}
          columns={columns}
          rowKey={(batch) => batch.id}
          ariaLabel="批次效期列表"
          emptyTitle="没有匹配批次"
          emptyDescription={hasActiveFilters ? '当前筛选无结果，可清除条件后重试。' : '暂无批次数据。'}
          emptyAction={hasActiveFilters
            ? <button className="button button-quiet" type="button" onClick={clearFilters}>清除筛选</button>
            : undefined}
          onRowClick={(batch) => setSelectedBatchId(batch.id)}
          selectedRowKeys={selectedBatchId ? [selectedBatchId] : []}
        />
      </div>

      {filtered.length > 0 && <footer className="inventory-footer">
        <span>显示 <strong>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)}</strong> / {filtered.length}</span>
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={filtered.length}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      </footer>}
    </section>

    <DetailPanel
      open={Boolean(selectedBatch)}
      title={selectedBatch?.lotNumber}
      subtitle={selectedBatch ? `${selectedBatch.itemName} · ${selectedBatch.sku}` : undefined}
      size="medium"
      onClose={() => setSelectedBatchId(null)}
      footer={selectedBatch ? <div className="inventory-detail-actions">
        {selectedItem && <>
          {(selectedBatch.status === 'expiring' || selectedBatch.status === 'expired') && selectedBatch.quantity > 0 && (
            <button className="button button-quiet" type="button" onClick={() => onIssuePrefer(selectedBatch)}>
              {selectedBatch.status === 'expired' ? '隔离出库' : '临期领用'}
            </button>
          )}
          <button className="button button-quiet" type="button" onClick={() => onReceive(selectedItem)}>补货入库</button>
          <button className="button button-primary" type="button" onClick={() => {
            setSelectedBatchId(null)
            onOpenItem(selectedItem)
          }}>跳转物资台账</button>
        </>}
      </div> : undefined}
    >
      {selectedBatch && <>
        <div className="inventory-detail-status inventory-detail-status-row">
          <StatusBadge
            status={selectedBatch.status}
            label={INVENTORY_BATCH_STATUS_LABELS[selectedBatch.status]}
            variant={batchVariant(selectedBatch.status)}
            size="small"
          />
          <span className="inventory-batch-detail-qty">{selectedBatch.quantity} 在库</span>
        </div>
        <dl className="inventory-detail-grid">
          <div><dt>批号</dt><dd className="inventory-mono">{selectedBatch.lotNumber}</dd></div>
          <div><dt>SKU</dt><dd className="inventory-mono">{selectedBatch.sku}</dd></div>
          <div><dt>物资</dt><dd>{selectedBatch.itemName}</dd></div>
          <div><dt>库位</dt><dd>{selectedBatch.location}</dd></div>
          <div><dt>供应商</dt><dd>{selectedBatch.supplier}</dd></div>
          <div><dt>收货日期</dt><dd>{formatDate(selectedBatch.receivedAt)}</dd></div>
          <div><dt>到期日</dt><dd>{formatDate(selectedBatch.expiresAt)}</dd></div>
          <div><dt>效期状态</dt><dd>{INVENTORY_BATCH_STATUS_LABELS[selectedBatch.status]}</dd></div>
        </dl>
        {selectedItem ? <p className="inventory-notes">
          关联台账：账面 {selectedItem.quantity}{selectedItem.unit}
          · 可用 {Math.max(0, selectedItem.quantity - selectedItem.reservedQuantity)}{selectedItem.unit}
          · 警戒线 {selectedItem.reorderPoint}{selectedItem.unit}
          · 责任组 {selectedItem.owner}
        </p> : <p className="inventory-notes">未找到关联物资台账记录。</p>}
      </>}
    </DetailPanel>
  </section>
}
