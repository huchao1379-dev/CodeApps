import { useMemo, useState } from 'react'
import {
  DataTable,
  FilterBar,
  Pagination,
  SearchInput,
  StatusBadge,
  Timeline,
  type FilterDefinition,
  type FilterValues,
  type TableColumn,
  type TimelineItem,
} from '../../../shared/components'
import { sampleInventoryItems } from '../data/sampleInventory'
import { INVENTORY_STATUS_LABELS, type InventoryItem, type InventoryStockStatus } from '../types/inventory.types'
import './InventoryWorkspacePanel.css'

const PAGE_SIZE = 8

export type InventoryView = 'overview' | 'ledger' | 'movements' | 'locations'

function statusVariant(status: InventoryStockStatus) {
  if (status === 'out') return 'danger' as const
  if (status === 'low') return 'warning' as const
  if (status === 'reserved') return 'info' as const
  return 'success' as const
}

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

export interface InventoryWorkspacePanelProps {
  view: InventoryView
}

export function InventoryWorkspacePanel({ view }: InventoryWorkspacePanelProps) {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const categories = useMemo(
    () => [...new Set(sampleInventoryItems.map((item) => item.category))],
    [],
  )

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase()
    return sampleInventoryItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (!normalized) return true
      return [item.sku, item.name, item.location, item.owner].some((value) => value.toLocaleLowerCase().includes(normalized))
    })
  }, [search, statusFilter, categoryFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selected = sampleInventoryItems.find((item) => item.id === selectedId) ?? null

  const summary = useMemo(() => ({
    total: sampleInventoryItems.length,
    low: sampleInventoryItems.filter((item) => item.status === 'low').length,
    out: sampleInventoryItems.filter((item) => item.status === 'out').length,
    reserved: sampleInventoryItems.filter((item) => item.status === 'reserved').length,
    locations: new Set(sampleInventoryItems.map((item) => item.location)).size,
  }), [])

  const locationRows = useMemo(() => {
    const byLocation = new Map<string, { location: string; skus: number; quantity: number; lowOrOut: number }>()
    sampleInventoryItems.forEach((item) => {
      const current = byLocation.get(item.location) ?? { location: item.location, skus: 0, quantity: 0, lowOrOut: 0 }
      current.skus += 1
      current.quantity += item.quantity
      if (item.status === 'low' || item.status === 'out') current.lowOrOut += 1
      byLocation.set(item.location, current)
    })
    return [...byLocation.values()]
  }, [])

  const filterDefinitions: FilterDefinition[] = [
    {
      key: 'status', label: '库存状态', type: 'select',
      options: [
        { value: 'all', label: '全部状态' },
        ...Object.entries(INVENTORY_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      ],
    },
    {
      key: 'category', label: '类别', type: 'select',
      options: [
        { value: 'all', label: '全部类别' },
        ...categories.map((category) => ({ value: category, label: category })),
      ],
    },
  ]
  const filterValues: FilterValues = { status: statusFilter, category: categoryFilter }

  const columns: TableColumn<InventoryItem>[] = [
    {
      key: 'name', title: '物资', width: 240, sortable: false,
      render: (_, item) => <div className="inventory-name-cell"><strong>{item.name}</strong><small>{item.sku}</small></div>,
    },
    { key: 'category', title: '类别', width: 120 },
    { key: 'location', title: '库位', width: 140 },
    {
      key: 'quantity', title: '数量', width: 90,
      render: (_, item) => <span>{item.quantity}<small className="inventory-reorder"> / 警戒 {item.reorderPoint}</small></span>,
    },
    {
      key: 'status', title: '状态', width: 100,
      render: (_, item) => <StatusBadge status={item.status} label={INVENTORY_STATUS_LABELS[item.status]} variant={statusVariant(item.status)} size="small" />,
    },
    { key: 'owner', title: '责任组', width: 110 },
    {
      key: 'updatedAt', title: '更新时间', width: 150,
      render: (_, item) => <span className="inventory-date">{formatDate(item.updatedAt)}</span>,
    },
  ]

  const timelineItems: TimelineItem[] = selected ? [
    {
      id: `${selected.id}-sync`,
      title: '样例库存记录',
      description: '当前为本地样例数据，后续可接入 Dataverse / SharePoint 库存表。',
      meta: <small>SKU {selected.sku}</small>,
      time: formatDate(selected.updatedAt),
      tone: 'info',
    },
    {
      id: `${selected.id}-status`,
      title: `当前状态：${INVENTORY_STATUS_LABELS[selected.status]}`,
      description: `库位 ${selected.location} · 责任组 ${selected.owner}`,
      time: formatDate(selected.updatedAt),
      tone: statusVariant(selected.status) === 'danger' ? 'warning' : 'success',
    },
  ] : []

  if (view === 'overview') {
    return <section className="inventory-panel" aria-label="库存概览">
      <div className="inventory-metrics">
        <article><span>SKU 总数</span><strong>{summary.total}</strong></article>
        <article><span>偏低</span><strong>{summary.low}</strong></article>
        <article><span>缺货</span><strong>{summary.out}</strong></article>
        <article><span>预留</span><strong>{summary.reserved}</strong></article>
        <article><span>库位数</span><strong>{summary.locations}</strong></article>
      </div>
      <p className="inventory-placeholder-copy">从左侧菜单进入「库存台账」查看明细，或切换到「库位」核对存放位置。</p>
    </section>
  }

  if (view === 'movements') {
    return <section className="inventory-panel" aria-label="出入库">
      <div className="inventory-empty-card">
        <h2>出入库记录</h2>
        <p>占位视图：后续在此接入领用、归还与调拨流水。当前工作台已通过左侧工作区切换进入库存域。</p>
      </div>
    </section>
  }

  if (view === 'locations') {
    return <section className="inventory-panel" aria-label="库位">
      <section className="inventory-card">
        <header className="inventory-list-header">
          <div>
            <div className="inventory-title-row"><h2>库位一览</h2><span>{locationRows.length}</span></div>
            <p>按样例台账汇总的存放位置</p>
          </div>
        </header>
        <div className="inventory-location-grid">
          {locationRows.map((row) => <article key={row.location} className="inventory-location-card">
            <strong>{row.location}</strong>
            <p>{row.skus} 个 SKU · 存量 {row.quantity}</p>
            <small>{row.lowOrOut > 0 ? `${row.lowOrOut} 项偏低/缺货` : '库存正常'}</small>
          </article>)}
        </div>
      </section>
    </section>
  }

  return <section className="inventory-panel" aria-label="库存台账">
    <section className="inventory-card">
      <header className="inventory-list-header">
        <div>
          <div className="inventory-title-row"><h2>库存台账</h2><span>{filtered.length}</span></div>
          <p>本地样例 {sampleInventoryItems.length} 条</p>
        </div>
        <div className="inventory-controls">
          <SearchInput
            value={query}
            onChange={(value) => { setQuery(value); setPage(1) }}
            onSearch={(value) => { setSearch(value); setPage(1) }}
            onClear={() => { setQuery(''); setSearch(''); setPage(1) }}
            placeholder="搜索 SKU、名称、库位或责任组"
            ariaLabel="搜索库存"
          />
          <FilterBar
            definitions={filterDefinitions}
            values={filterValues}
            onChange={(next) => {
              setStatusFilter(String(next.status ?? 'all'))
              setCategoryFilter(String(next.category ?? 'all'))
              setPage(1)
            }}
            onReset={() => { setStatusFilter('all'); setCategoryFilter('all'); setPage(1) }}
            resetLabel="清除筛选"
          />
        </div>
      </header>

      <DataTable
        data={pageRows}
        columns={columns}
        rowKey={(item) => item.id}
        ariaLabel="库存列表"
        emptyTitle="没有匹配的库存记录"
        emptyDescription="调整筛选条件或清除搜索关键词。"
        onRowClick={(item) => setSelectedId(item.id)}
        selectedRowKeys={selectedId ? [selectedId] : []}
      />

      <footer className="inventory-footer">
        <span>显示 <strong>{filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)}</strong> / {filtered.length}</span>
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={filtered.length}
          pageSizeOptions={[8, 16, 32]}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      </footer>
    </section>

    {selected && <aside className="inventory-detail" aria-label="库存明细">
      <header>
        <div>
          <StatusBadge status={selected.status} label={INVENTORY_STATUS_LABELS[selected.status]} variant={statusVariant(selected.status)} size="small" />
          <h3>{selected.name}</h3>
          <p>{selected.sku}</p>
        </div>
        <button className="icon-button" type="button" aria-label="关闭库存明细" onClick={() => setSelectedId(null)}>×</button>
      </header>
      <dl className="inventory-detail-grid">
        <div><dt>类别</dt><dd>{selected.category}</dd></div>
        <div><dt>库位</dt><dd>{selected.location}</dd></div>
        <div><dt>数量</dt><dd>{selected.quantity}</dd></div>
        <div><dt>警戒线</dt><dd>{selected.reorderPoint}</dd></div>
        <div><dt>责任组</dt><dd>{selected.owner}</dd></div>
        <div><dt>更新时间</dt><dd>{formatDate(selected.updatedAt)}</dd></div>
      </dl>
      <div className="inventory-timeline-block">
        <h4>记录时间线</h4>
        <Timeline items={timelineItems} emptyLabel="暂无库存事件" ariaLabel="库存样例时间线" />
      </div>
    </aside>}
  </section>
}
