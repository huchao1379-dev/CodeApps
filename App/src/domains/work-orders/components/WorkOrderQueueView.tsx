import {
  BulkActionBar,
  DataTable,
  FilterBar,
  Pagination,
  SearchInput,
  type BulkAction,
  type FilterDefinition,
  type FilterValues,
  type SortState,
} from '../../../shared/components'
import { WORK_ORDER_STATUS, type WorkOrder, type WorkOrderEvent, type WorkOrderStatus, type WorkOrderStoreState } from '../types/workOrder.types'
import { formatDate } from '../utils/formatDate'
import { MetricCard } from './WorkOrderBadges'
import { workOrderColumns } from './workOrderColumns'

export interface WorkOrderQueueViewProps {
  state: WorkOrderStoreState
  loading: boolean
  error: string | null
  stats: { total: number; new: number; inProgress: number; resolved: number }
  recentActivity: WorkOrderEvent[]
  visibleWorkOrders: WorkOrder[]
  pageRows: WorkOrder[]
  page: number
  pageSize: number
  sort: SortState[]
  searchInput: string
  filterDefinitions: FilterDefinition[]
  filterValues: FilterValues
  selectedWorkOrderKeys: string[]
  selectedWorkOrders: WorkOrder[]
  batchActions: BulkAction[]
  busy: boolean
  canCreate: boolean
  statusFilter: string
  overdueOnly: boolean
  linkedWorkOrderIds: string[] | null
  linkedFilterLabel: string | null
  serverFilterNote: string | null
  onSearchInputChange: (value: string) => void
  onSearch: (value: string) => void
  onClearSearch: () => void
  onFilterChange: (values: FilterValues) => void
  onClearFilters: () => void
  onMetricStatusFilter: (status: 'all' | WorkOrderStatus) => void
  onSelectWorkOrder: (workOrderId: string) => void
  onSelectionChange: (keys: string[]) => void
  onSortChange: (sort: SortState[]) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onBatchAction: (actionId: string) => void
  onClearSelection: () => void
  onCreate: () => void
  onRetryLoad: () => void
  onClearLinkedFilter: () => void
  onClearServerFilter: () => void
  onClearOverdueOnly: () => void
}

export function WorkOrderQueueView({
  state,
  loading,
  error,
  stats,
  recentActivity,
  visibleWorkOrders,
  pageRows,
  page,
  pageSize,
  sort,
  searchInput,
  filterDefinitions,
  filterValues,
  selectedWorkOrderKeys,
  selectedWorkOrders,
  batchActions,
  busy,
  canCreate,
  statusFilter,
  overdueOnly,
  linkedWorkOrderIds,
  linkedFilterLabel,
  serverFilterNote,
  onSearchInputChange,
  onSearch,
  onClearSearch,
  onFilterChange,
  onClearFilters,
  onMetricStatusFilter,
  onSelectWorkOrder,
  onSelectionChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onBatchAction,
  onClearSelection,
  onCreate,
  onRetryLoad,
  onClearLinkedFilter,
  onClearServerFilter,
  onClearOverdueOnly,
}: WorkOrderQueueViewProps) {
  return <>
    <section className="metrics-grid" aria-label="工单概览快捷筛选">
      <MetricCard label="全部工单" value={stats.total} detail="点击显示全部状态" tone="purple"
        active={statusFilter === 'all'} onClick={() => onMetricStatusFilter('all')} />
      <MetricCard label="待分派" value={stats.new} detail="点击筛选待分派工单" tone="amber"
        active={statusFilter === String(WORK_ORDER_STATUS.new)} onClick={() => onMetricStatusFilter(WORK_ORDER_STATUS.new)} />
      <MetricCard label="处理中" value={stats.inProgress} detail="点击筛选处理中工单" tone="blue"
        active={statusFilter === String(WORK_ORDER_STATUS.inProgress)} onClick={() => onMetricStatusFilter(WORK_ORDER_STATUS.inProgress)} />
      <MetricCard label="已解决" value={stats.resolved} detail="点击筛选已解决工单" tone="green"
        active={statusFilter === String(WORK_ORDER_STATUS.resolved)} onClick={() => onMetricStatusFilter(WORK_ORDER_STATUS.resolved)} />
    </section>

    <section className="activity-strip">
      <div className="activity-label"><span className="activity-icon">◷</span><div><strong>最近动态</strong><small>Dataverse 工单历史</small></div></div>
      {recentActivity.map((event) => {
        const workOrder = state.workOrders.find((item) => item.id === event.workOrderId)
        return <button className="activity-item" key={event.id} onClick={() => workOrder && onSelectWorkOrder(workOrder.id)}>
          <span className={`activity-dot dot-${event.kind}`} /><span><strong>{event.description}</strong><small>{workOrder?.workOrderNumber ?? '工单'} · {formatDate(event.occurredAt)}</small></span>
        </button>
      })}
      {!loading && !error && recentActivity.length === 0 && <span className="activity-empty">暂无已读取的工单历史</span>}
    </section>

    <section className="work-order-card work-order-list-card">
      <header className="list-header work-order-list-header">
        <div className="work-order-list-heading">
          <div className="list-title-row"><h2>工单队列</h2><span className="result-count">{visibleWorkOrders.length}</span></div>
          <p>在当前身份可读取的 {state.workOrders.length} 条工单中筛选；选择行可查看完整字段与流转历史</p>
        </div>
        <div className="list-controls">
          <SearchInput
            value={searchInput}
            onChange={(value) => onSearchInputChange(value)}
            onSearch={onSearch}
            onClear={onClearSearch}
            placeholder="搜索编号、标题、描述或负责人"
            ariaLabel="搜索工单"
          />
          <FilterBar definitions={filterDefinitions} values={filterValues} onChange={onFilterChange} onReset={onClearFilters} resetLabel="清除筛选" />
        </div>
      </header>
      {linkedFilterLabel && linkedWorkOrderIds && <div className="overdue-filter-chip overview-link-chip">
        <span>概览联动：{linkedFilterLabel} · {linkedWorkOrderIds.length} 张</span>
        <button type="button" onClick={onClearLinkedFilter}>清除联动</button>
      </div>}
      {serverFilterNote && <div className="overdue-filter-chip server-filter-chip">
        <span>{serverFilterNote}</span>
        <button type="button" onClick={onClearServerFilter}>清除</button>
      </div>}
      {overdueOnly && <div className="overdue-filter-chip">
        <span>仅显示预计时间已逾期的活动工单</span>
        <button type="button" onClick={onClearOverdueOnly}>清除</button>
      </div>}
      <p className="list-shortcut-hint">快捷键：<kbd>/</kbd> 聚焦搜索 · <kbd>Esc</kbd> 清除多选</p>
      <BulkActionBar selectedCount={selectedWorkOrders.length} actions={batchActions} onAction={onBatchAction} onClear={onClearSelection} busy={busy} />
      <DataTable
        data={pageRows}
        columns={workOrderColumns}
        rowKey={(workOrder) => workOrder.id}
        ariaLabel="工单列表"
        loading={loading}
        loadingLabel="正在通过 Code Apps 数据连接读取 Dataverse…"
        error={!loading && state.workOrders.length === 0 ? error : null}
        onRetry={onRetryLoad}
        emptyTitle={state.workOrders.length === 0 ? '当前数据源没有工单' : '没有找到匹配的工单'}
        emptyDescription={state.workOrders.length === 0 ? '创建第一张工单或检查当前环境的数据记录。' : '更改筛选条件或搜索关键词。'}
        emptyAction={<button
          className="button button-quiet"
          type="button"
          disabled={state.workOrders.length === 0 && !canCreate}
          title={state.workOrders.length === 0 && !canCreate ? '当前角色无新建工单权限' : undefined}
          onClick={state.workOrders.length === 0 ? onCreate : onClearFilters}
        >
          {state.workOrders.length === 0 ? '新建工单' : '清除筛选'}
        </button>}
        selectedRowKeys={selectedWorkOrderKeys}
        onSelectionChange={onSelectionChange}
        onRowClick={(workOrder) => onSelectWorkOrder(workOrder.id)}
        sort={sort}
        onSortChange={(nextSort) => onSortChange(nextSort)}
      />
      <footer className="table-footer work-order-table-footer">
        <span>显示 <strong>{visibleWorkOrders.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleWorkOrders.length)}</strong> / {visibleWorkOrders.length}</span>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={visibleWorkOrders.length}
          loading={loading}
          pageSizeOptions={[10, 20, 50]}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
        <span className="demo-pagination">当前身份可读取 {state.workOrders.length} 条工单</span>
      </footer>
    </section>
  </>
}
