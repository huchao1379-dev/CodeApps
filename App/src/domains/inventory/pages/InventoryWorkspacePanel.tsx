import { useEffect, useMemo, useState } from 'react'
import {
  AreaTrendChart,
  BulkActionBar,
  CapacityGaugeChart,
  DataTable,
  DetailPanel,
  DonutChart,
  EmptyState,
  FilterBar,
  Pagination,
  SearchInput,
  StackedCompositionChart,
  StatusBadge,
  Timeline,
  Toast,
  type FilterDefinition,
  type FilterValues,
  type TableColumn,
  type TimelineItem,
  type TimelineTone,
} from '../../../shared/components'
import { InventoryAlertsView } from '../components/InventoryAlertsView'
import {
  InventoryBulkTransferDialog,
  InventoryCreatePurchaseOrderDialog,
  InventoryItemFormDialog,
  InventoryQuickPickDialog,
  InventoryScanDialog,
  InventoryStartStocktakeDialog,
  InventoryStockActionDialog,
  InventoryStocktakePostDialog,
  type StockActionKind,
} from '../components/InventoryActionDialogs'
import { InventoryBatchesView } from '../components/InventoryBatchesView'
import {
  LocationRoute,
  MovementQuantityBadge,
  StockQuantityCell,
} from '../components/InventoryQuantity'
import { InventoryReplenishView } from '../components/InventoryReplenishView'
import { InventoryStocktakeView } from '../components/InventoryStocktakeView'
import {
  adjustInventoryQuantity,
  batchesForItem,
  buildInventoryAlerts,
  buildReplenishmentSuggestions,
  bulkTransferInventory,
  cancelPurchaseOrder,
  createInventoryItem,
  createInventoryStoreState,
  createPurchaseOrderFromSuggestions,
  findItemBySku,
  issueInventory,
  markStocktakeReview,
  movementsForItem,
  postStocktake,
  receiveInventory,
  receivePurchaseOrder,
  releaseInventoryReserve,
  reserveInventory,
  resetInventoryStoreState,
  startStocktake,
  summarizeInventoryValuation,
  summarizeLocations,
  transferInventory,
  updateInventoryItem,
  updateStocktakeCount,
  type InventoryStoreState,
} from '../services/inventoryStore'
import {
  INVENTORY_BATCH_STATUS_LABELS,
  INVENTORY_MOVEMENT_LABELS,
  INVENTORY_STATUS_LABELS,
  STOCKTAKE_VARIANCE_THRESHOLD,
  analyzeStocktakeVariance,
  availableQuantity,
  type InventoryItem,
  type InventoryItemInput,
  type InventoryMovement,
  type InventoryMovementType,
  type InventoryStockStatus,
} from '../types/inventory.types'
import { useAccessControl } from '../../access-control/context/AccessControlContext'
import { APP_PERMISSION_LABELS, type AppPermission } from '../../access-control/types/access.types'
import { csvDateStamp, downloadCsv } from '../../../shared/utils/csvExport'
import './InventoryWorkspacePanel.css'

const STOCK_PERMISSION: Record<StockActionKind, AppPermission> = {
  receive: 'inventory.receive',
  issue: 'inventory.issue',
  transfer: 'inventory.transfer',
  adjust: 'inventory.adjust',
  reserve: 'inventory.reserve',
  release: 'inventory.reserve',
}

const PAGE_SIZE = 8
const MOVEMENT_PAGE_SIZE = 10

export type InventoryView =
  | 'overview'
  | 'ledger'
  | 'movements'
  | 'locations'
  | 'alerts'
  | 'stocktake'
  | 'replenish'
  | 'batches'
  | 'roles'

function statusVariant(status: InventoryStockStatus) {
  if (status === 'out') return 'danger' as const
  if (status === 'low') return 'warning' as const
  if (status === 'reserved') return 'info' as const
  return 'success' as const
}

function movementTone(type: InventoryMovementType): TimelineTone {
  if (type === 'outbound' || type === 'adjust') return 'warning'
  if (type === 'reserve') return 'info'
  if (type === 'release' || type === 'inbound') return 'success'
  return 'default'
}

function movementBadgeVariant(type: InventoryMovementType) {
  if (type === 'outbound') return 'warning' as const
  if (type === 'adjust') return 'danger' as const
  if (type === 'reserve') return 'info' as const
  if (type === 'inbound' || type === 'release') return 'success' as const
  return 'neutral' as const
}

const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

const formatDay = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric', day: 'numeric',
}).format(new Date(value))

export interface InventoryWorkspacePanelProps {
  view: InventoryView
  createRequestToken?: number
  resetRequestToken?: number
  scanRequestToken?: number
  stocktakeRequestToken?: number
  onNavigate?: (view: InventoryView) => void
}

export function InventoryWorkspacePanel({
  view,
  createRequestToken = 0,
  resetRequestToken = 0,
  scanRequestToken = 0,
  stocktakeRequestToken = 0,
  onNavigate,
}: InventoryWorkspacePanelProps) {
  const { can } = useAccessControl()
  const [store, setStore] = useState<InventoryStoreState>(() => createInventoryStoreState())
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const deny = (permission: AppPermission) => {
    setNotice({
      kind: 'error',
      message: `当前角色无「${APP_PERMISSION_LABELS[permission]}」权限。请到「角色权限」切换角色后重试。`,
    })
  }

  const ensure = (permission: AppPermission) => {
    if (can(permission)) return true
    deny(permission)
    return false
  }

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const [movementQuery, setMovementQuery] = useState('')
  const [movementSearch, setMovementSearch] = useState('')
  const [movementTypeFilter, setMovementTypeFilter] = useState('all')
  const [movementLocationFilter, setMovementLocationFilter] = useState('all')
  const [movementPage, setMovementPage] = useState(1)
  const [movementPageSize, setMovementPageSize] = useState(MOVEMENT_PAGE_SIZE)
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null)

  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [stockKind, setStockKind] = useState<StockActionKind | null>(null)
  const [stockItemId, setStockItemId] = useState<string | null>(null)
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false)
  const [quickPickKind, setQuickPickKind] = useState<StockActionKind | null>(null)
  const [stocktakeDialogOpen, setStocktakeDialogOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [purchaseOrderDialogOpen, setPurchaseOrderDialogOpen] = useState(false)
  const [purchaseOrderItemIds, setPurchaseOrderItemIds] = useState<string[]>([])
  const [stocktakePostSessionId, setStocktakePostSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (createRequestToken <= 0) return
    if (!can('inventory.create')) {
      deny('inventory.create')
      return
    }
    setEditingItem(null)
    setDialogError(null)
    setItemFormOpen(true)
  }, [createRequestToken])

  useEffect(() => {
    if (scanRequestToken <= 0) return
    if (!can('inventory.scan')) {
      deny('inventory.scan')
      return
    }
    setDialogError(null)
    setScanOpen(true)
  }, [scanRequestToken])

  useEffect(() => {
    if (stocktakeRequestToken <= 0) return
    if (!can('inventory.stocktake')) {
      deny('inventory.stocktake')
      return
    }
    setDialogError(null)
    setStocktakeDialogOpen(true)
  }, [stocktakeRequestToken])

  useEffect(() => {
    if (resetRequestToken <= 0) return
    setStore(resetInventoryStoreState())
    setSelectedId(null)
    setSelectedKeys([])
    setSelectedMovementId(null)
    setNotice({ kind: 'info', message: '已恢复本地 mock 样例库存数据。' })
  }, [resetRequestToken])

  const categories = useMemo(
    () => [...new Set(store.items.map((item) => item.category))],
    [store.items],
  )

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase()
    return store.items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (!normalized) return true
      return [item.sku, item.name, item.location, item.owner].some((value) => value.toLocaleLowerCase().includes(normalized))
    })
  }, [store.items, search, statusFilter, categoryFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selected = store.items.find((item) => item.id === selectedId) ?? null
  const stockItem = store.items.find((item) => item.id === stockItemId) ?? null

  const filteredMovements = useMemo(() => {
    const normalized = movementSearch.trim().toLocaleLowerCase()
    return store.movements.filter((movement) => {
      if (movementTypeFilter === 'reserve-group') {
        if (movement.type !== 'reserve' && movement.type !== 'release') return false
      } else if (movementTypeFilter !== 'all' && movement.type !== movementTypeFilter) {
        return false
      }
      if (movementLocationFilter !== 'all') {
        const hitLocation = movement.fromLocation === movementLocationFilter
          || movement.toLocation === movementLocationFilter
        if (!hitLocation) return false
      }
      if (!normalized) return true
      return [
        movement.number,
        movement.sku,
        movement.itemName,
        movement.operator,
        movement.reason,
        movement.relatedWorkOrder ?? '',
        movement.fromLocation ?? '',
        movement.toLocation ?? '',
      ].some((value) => value.toLocaleLowerCase().includes(normalized))
    })
  }, [store.movements, movementSearch, movementTypeFilter, movementLocationFilter])

  const movementPageCount = Math.max(1, Math.ceil(filteredMovements.length / Math.max(1, movementPageSize)))
  const currentMovementPage = Math.min(movementPage, movementPageCount)
  const movementRows = filteredMovements.slice(
    (currentMovementPage - 1) * movementPageSize,
    currentMovementPage * movementPageSize,
  )
  const selectedMovement = store.movements.find((movement) => movement.id === selectedMovementId) ?? null
  const selectedMovementItem = selectedMovement
    ? store.items.find((item) => item.id === selectedMovement.itemId) ?? null
    : null

  const movementStats = useMemo(() => {
    const countByType = (type: InventoryMovementType) => store.movements.filter((item) => item.type === type).length
    return {
      inbound: countByType('inbound'),
      outbound: countByType('outbound'),
      transfer: countByType('transfer'),
      adjust: countByType('adjust'),
      reserve: countByType('reserve') + countByType('release'),
    }
  }, [store.movements])

  const locationSummaries = useMemo(() => summarizeLocations(store), [store])
  const inventoryAlerts = useMemo(() => buildInventoryAlerts(store), [store])
  const replenishmentSuggestions = useMemo(() => buildReplenishmentSuggestions(store), [store])
  const valuation = useMemo(() => summarizeInventoryValuation(store), [store])
  const selectedBatches = useMemo(
    () => (selected ? batchesForItem(store, selected.id) : []),
    [store, selected],
  )

  const summary = useMemo(() => {
    const totalQuantity = store.items.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = store.items.reduce((sum, item) => sum + item.reservedQuantity, 0)
    return {
      total: store.items.length,
      low: store.items.filter((item) => item.status === 'low').length,
      out: store.items.filter((item) => item.status === 'out').length,
      reservedStatus: store.items.filter((item) => item.status === 'reserved').length,
      reservedUnits: reserved,
      availableUnits: Math.max(0, totalQuantity - reserved),
      totalQuantity,
      locations: store.locations.filter((location) => location.isActive).length,
      movements: store.movements.length,
      alerts: inventoryAlerts.length,
      stocktakes: store.stocktakes.filter((session) => session.status !== 'posted').length,
      batchesAtRisk: store.batches.filter((batch) => batch.status === 'expiring' || batch.status === 'expired').length,
      valuation: valuation.totalValue,
    }
  }, [store, inventoryAlerts.length, valuation.totalValue])

  const statusDonut = useMemo(() => (
    (Object.keys(INVENTORY_STATUS_LABELS) as InventoryStockStatus[]).map((status) => ({
      id: status,
      label: INVENTORY_STATUS_LABELS[status],
      value: store.items.filter((item) => item.status === status).length,
      color: status === 'out' ? '#c84c3d'
        : status === 'low' ? '#e0a24a'
          : status === 'reserved' ? '#5b9bd5'
            : '#4e9d7c',
    })).filter((item) => item.value > 0)
  ), [store.items])

  const movementTrend = useMemo(() => {
    const buckets = new Map<string, { inbound: number; outbound: number; label: string }>()
    const now = new Date()
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(now)
      day.setDate(now.getDate() - offset)
      const key = day.toISOString().slice(0, 10)
      buckets.set(key, { inbound: 0, outbound: 0, label: formatDay(day.toISOString()) })
    }
    store.movements.forEach((movement) => {
      const key = movement.occurredAt.slice(0, 10)
      const bucket = buckets.get(key)
      if (!bucket) return
      if (movement.type === 'inbound' || (movement.type === 'adjust' && movement.quantity > 0)) {
        bucket.inbound += Math.abs(movement.quantity)
      }
      if (movement.type === 'outbound' || (movement.type === 'adjust' && movement.quantity < 0)) {
        bucket.outbound += Math.abs(movement.quantity)
      }
    })
    return [...buckets.entries()].map(([id, bucket]) => ({
      id,
      label: bucket.label,
      value: bucket.inbound,
      secondaryValue: bucket.outbound,
    }))
  }, [store.movements])

  const capacityItems = useMemo(() => locationSummaries.map((location) => ({
    id: location.id,
    label: location.code,
    subtitle: location.name,
    value: location.quantity,
    capacity: location.capacity,
    meta: `${location.skus} SKU · 利用率 ${location.utilization}%`,
  })), [locationSummaries])

  const applyStoreChange = (recipe: (current: InventoryStoreState) => InventoryStoreState, successMessage: string) => {
    setBusy(true)
    setDialogError(null)
    try {
      setStore((current) => recipe(current))
      setNotice({ kind: 'success', message: successMessage })
      setItemFormOpen(false)
      setEditingItem(null)
      setStockKind(null)
      setStockItemId(null)
      setBulkTransferOpen(false)
      setSelectedKeys([])
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败'
      setDialogError(message)
      setNotice({ kind: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  const openCreate = () => {
    if (!ensure('inventory.create')) return
    setEditingItem(null)
    setDialogError(null)
    setItemFormOpen(true)
  }

  const openEdit = (item: InventoryItem) => {
    if (!ensure('inventory.edit')) return
    setEditingItem(item)
    setDialogError(null)
    setItemFormOpen(true)
  }

  const openStockAction = (item: InventoryItem, kind: StockActionKind) => {
    if (!ensure(STOCK_PERMISSION[kind])) return
    setStockItemId(item.id)
    setStockKind(kind)
    setDialogError(null)
  }

  const openScan = () => {
    if (!ensure('inventory.scan')) return
    setDialogError(null)
    setScanOpen(true)
  }

  const openStocktake = () => {
    if (!ensure('inventory.stocktake')) return
    setDialogError(null)
    setStocktakeDialogOpen(true)
  }

  const openQuickPick = (kind: StockActionKind) => {
    if (!ensure(STOCK_PERMISSION[kind])) return
    setQuickPickKind(kind)
  }

  const openBulkTransfer = () => {
    if (!ensure('inventory.transfer')) return
    setDialogError(null)
    setBulkTransferOpen(true)
  }

  const openPurchaseOrder = (itemIds: string[]) => {
    if (!ensure('inventory.purchase.create')) return
    setPurchaseOrderItemIds(itemIds)
    setDialogError(null)
    setPurchaseOrderDialogOpen(true)
  }

  const openStocktakePost = (sessionId: string) => {
    if (!ensure('inventory.stocktake.post')) return
    setDialogError(null)
    setStocktakePostSessionId(sessionId)
  }

  const handleItemSubmit = (input: InventoryItemInput) => {
    if (editingItem) {
      applyStoreChange(
        (current) => updateInventoryItem(current, editingItem.id, input),
        `已更新物资 ${input.sku}`,
      )
      return
    }
    applyStoreChange(
      (current) => createInventoryItem(current, input),
      `已新建物资 ${input.sku}`,
    )
  }

  const handleStockSubmit = (payload: {
    quantity: number
    reason: string
    operator: string
    toLocation?: string
    relatedWorkOrder?: string
  }) => {
    if (!stockItem || !stockKind) return
    const itemId = stockItem.id
    applyStoreChange((current) => {
      if (stockKind === 'receive') {
        return receiveInventory(current, { itemId, quantity: payload.quantity, reason: payload.reason, operator: payload.operator })
      }
      if (stockKind === 'issue') {
        return issueInventory(current, {
          itemId,
          quantity: payload.quantity,
          reason: payload.reason,
          operator: payload.operator,
          relatedWorkOrder: payload.relatedWorkOrder,
        })
      }
      if (stockKind === 'adjust') {
        return adjustInventoryQuantity(current, {
          itemId,
          delta: payload.quantity,
          reason: payload.reason,
          operator: payload.operator,
        })
      }
      if (stockKind === 'transfer') {
        return transferInventory(current, {
          itemId,
          quantity: payload.quantity,
          toLocation: payload.toLocation ?? '',
          reason: payload.reason,
          operator: payload.operator,
        })
      }
      if (stockKind === 'reserve') {
        return reserveInventory(current, {
          itemId,
          quantity: payload.quantity,
          reason: payload.reason,
          operator: payload.operator,
        })
      }
      return releaseInventoryReserve(current, {
        itemId,
        quantity: payload.quantity,
        reason: payload.reason,
        operator: payload.operator,
      })
    }, `${INVENTORY_MOVEMENT_LABELS[
      stockKind === 'receive' ? 'inbound'
        : stockKind === 'issue' ? 'outbound'
          : stockKind === 'adjust' ? 'adjust'
            : stockKind === 'transfer' ? 'transfer'
              : stockKind === 'reserve' ? 'reserve'
                : 'release'
    ]}已完成：${stockItem.name}`)
  }

  const exportMovementsCsv = () => {
    downloadCsv({
      filename: `inventory-movements-${csvDateStamp()}.csv`,
      headers: ['流水号', '类型', 'SKU', '物资', '数量', '源库位', '目标库位', '操作人', '原因', '关联工单', '发生时间'],
      rows: filteredMovements.map((movement) => [
        movement.number,
        INVENTORY_MOVEMENT_LABELS[movement.type],
        movement.sku,
        movement.itemName,
        movement.quantity,
        movement.fromLocation ?? '',
        movement.toLocation ?? '',
        movement.operator,
        movement.reason,
        movement.relatedWorkOrder ?? '',
        formatDate(movement.occurredAt),
      ]),
    })
    setNotice({ kind: 'success', message: `已导出 ${filteredMovements.length} 条流水。` })
  }

  const handleBulkTransfer = (payload: { toLocation: string; reason: string; operator: string }) => {
    setBusy(true)
    setDialogError(null)
    try {
      const result = bulkTransferInventory(store, selectedKeys, payload.toLocation, payload.reason, payload.operator)
      setStore(result.state)
      setBulkTransferOpen(false)
      setSelectedKeys([])
      if (result.failed.length === 0) {
        setNotice({ kind: 'success', message: `已成功调拨 ${result.success} 项物资。` })
      } else {
        setNotice({
          kind: 'info',
          message: `调拨完成：成功 ${result.success}，失败 ${result.failed.length}。${result.failed[0]?.message ?? ''}`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '批量调拨失败'
      setDialogError(message)
      setNotice({ kind: 'error', message })
    } finally {
      setBusy(false)
    }
  }

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

  const movementFilterDefinitions: FilterDefinition[] = [
    {
      key: 'type', label: '流水类型', type: 'select',
      options: [
        { value: 'all', label: '全部类型' },
        { value: 'reserve-group', label: '预留/释放' },
        ...Object.entries(INVENTORY_MOVEMENT_LABELS).map(([value, label]) => ({ value, label })),
      ],
    },
    {
      key: 'location', label: '涉及库位', type: 'select',
      options: [
        { value: 'all', label: '全部库位' },
        ...store.locations.map((location) => ({ value: location.name, label: location.name })),
      ],
    },
  ]

  const columns: TableColumn<InventoryItem>[] = [
    {
      key: 'name', title: '物资', width: 220, sortable: false,
      render: (_, item) => <div className="inventory-name-cell"><strong>{item.name}</strong><small>{item.sku}</small></div>,
    },
    { key: 'category', title: '类别', width: 110 },
    { key: 'location', title: '库位', width: 130 },
    {
      key: 'quantity', title: '数量', width: 150,
      render: (_, item) => <StockQuantityCell
        quantity={item.quantity}
        available={availableQuantity(item)}
        reserved={item.reservedQuantity}
        reorderPoint={item.reorderPoint}
        unit={item.unit}
      />,
    },
    {
      key: 'status', title: '状态', width: 90,
      render: (_, item) => <StatusBadge status={item.status} label={INVENTORY_STATUS_LABELS[item.status]} variant={statusVariant(item.status)} size="small" />,
    },
    { key: 'owner', title: '责任组', width: 100 },
    {
      key: 'actions', title: '操作', width: 220,
      render: (_, item) => <div className="inventory-row-actions" onClick={(event) => event.stopPropagation()}>
        <button className="button button-quiet inventory-mini-button" type="button" disabled={!can('inventory.receive')} title={!can('inventory.receive') ? '无入库权限' : undefined} onClick={() => openStockAction(item, 'receive')}>入库</button>
        <button className="button button-quiet inventory-mini-button" type="button" disabled={!can('inventory.issue')} title={!can('inventory.issue') ? '无领用权限' : undefined} onClick={() => openStockAction(item, 'issue')}>领用</button>
        <button className="button button-quiet inventory-mini-button" type="button" disabled={!can('inventory.transfer')} title={!can('inventory.transfer') ? '无调拨权限' : undefined} onClick={() => openStockAction(item, 'transfer')}>调拨</button>
        <button className="button button-quiet inventory-mini-button" type="button" disabled={!can('inventory.edit')} title={!can('inventory.edit') ? '无编辑权限' : undefined} onClick={() => openEdit(item)}>编辑</button>
      </div>,
    },
  ]

  const movementColumns: TableColumn<InventoryMovement>[] = [
    {
      key: 'number', title: '流水号', width: 160,
      render: (_, movement) => <div className="inventory-name-cell">
        <strong className="inventory-mono">{movement.number}</strong>
        <small>{formatDate(movement.occurredAt)}</small>
      </div>,
    },
    {
      key: 'type', title: '类型', width: 100,
      render: (_, movement) => <StatusBadge
        status={movement.type}
        label={INVENTORY_MOVEMENT_LABELS[movement.type]}
        variant={movementBadgeVariant(movement.type)}
        size="small"
      />,
    },
    {
      key: 'itemName', title: '物资', width: 180,
      render: (_, movement) => <div className="inventory-name-cell"><strong>{movement.itemName}</strong><small>{movement.sku}</small></div>,
    },
    {
      key: 'quantity', title: '数量', width: 110,
      render: (_, movement) => {
        const unit = store.items.find((item) => item.id === movement.itemId)?.unit
        return <MovementQuantityBadge type={movement.type} quantity={movement.quantity} unit={unit} />
      },
    },
    {
      key: 'route', title: '库位变化', width: 220,
      render: (_, movement) => <LocationRoute from={movement.fromLocation} to={movement.toLocation} />,
    },
    { key: 'operator', title: '操作人', width: 120 },
    {
      key: 'relatedWorkOrder', title: '关联工单', width: 110,
      render: (_, movement) => movement.relatedWorkOrder
        ? <button
          className="inventory-link-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setNotice({ kind: 'info', message: `关联工单 ${movement.relatedWorkOrder}（mock 引用）` })
          }}
        >{movement.relatedWorkOrder}</button>
        : <span className="inventory-muted">—</span>,
    },
  ]

  const timelineItems: TimelineItem[] = selected
    ? movementsForItem(store, selected.id).slice(0, 12).map((movement) => ({
      id: movement.id,
      title: `${INVENTORY_MOVEMENT_LABELS[movement.type]} · ${movement.quantity}${selected.unit}`,
      description: `${movement.reason}${movement.relatedWorkOrder ? ` · 工单 ${movement.relatedWorkOrder}` : ''}`,
      meta: <small>{movement.operator} · {movement.number}</small>,
      time: formatDate(movement.occurredAt),
      tone: movementTone(movement.type),
    }))
    : []

  const dialogs = <>
    {notice && <Toast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <InventoryItemFormDialog
      open={itemFormOpen}
      item={editingItem}
      locations={store.locations}
      busy={busy}
      error={dialogError}
      onClose={() => { setItemFormOpen(false); setEditingItem(null); setDialogError(null) }}
      onSubmit={handleItemSubmit}
    />
    <InventoryStockActionDialog
      open={Boolean(stockKind && stockItem)}
      kind={stockKind}
      item={stockItem}
      locations={store.locations}
      busy={busy}
      error={dialogError}
      onClose={() => { setStockKind(null); setStockItemId(null); setDialogError(null) }}
      onSubmit={handleStockSubmit}
    />
    <InventoryBulkTransferDialog
      open={bulkTransferOpen}
      count={selectedKeys.length}
      locations={store.locations}
      busy={busy}
      error={dialogError}
      onClose={() => { setBulkTransferOpen(false); setDialogError(null) }}
      onSubmit={handleBulkTransfer}
    />
    <InventoryQuickPickDialog
      open={Boolean(quickPickKind)}
      title={quickPickKind === 'issue' ? '快捷领用' : quickPickKind === 'transfer' ? '快捷调拨' : '快捷入库'}
      subtitle="先选择物资，再填写数量与原因"
      items={store.items}
      confirmLabel="继续"
      onClose={() => setQuickPickKind(null)}
      onPick={(item) => {
        const kind = quickPickKind
        setQuickPickKind(null)
        if (kind) openStockAction(item, kind)
      }}
    />
    <InventoryScanDialog
      open={scanOpen}
      busy={busy}
      error={dialogError}
      onClose={() => { setScanOpen(false); setDialogError(null) }}
      onResolve={(code, action) => {
        const item = findItemBySku(store, code)
        if (!item) {
          setDialogError(`未识别到物资：${code}`)
          return
        }
        setScanOpen(false)
        setDialogError(null)
        setSelectedId(item.id)
        openStockAction(item, action)
        setNotice({ kind: 'success', message: `已识别 ${item.name}（${item.sku}）` })
      }}
    />
    <InventoryStartStocktakeDialog
      open={stocktakeDialogOpen}
      locations={store.locations}
      busy={busy}
      error={dialogError}
      onClose={() => { setStocktakeDialogOpen(false); setDialogError(null) }}
      onSubmit={(payload) => {
        applyStoreChange(
          (current) => startStocktake(current, payload.location, payload.operator, payload.notes),
          `已发起 ${payload.location} 盘点`,
        )
        setStocktakeDialogOpen(false)
      }}
    />
    <InventoryCreatePurchaseOrderDialog
      open={purchaseOrderDialogOpen}
      selectedCount={purchaseOrderItemIds.length}
      totalQuantity={replenishmentSuggestions
        .filter((row) => purchaseOrderItemIds.includes(row.itemId))
        .reduce((sum, row) => sum + row.suggestedQty, 0)}
      totalAmount={replenishmentSuggestions
        .filter((row) => purchaseOrderItemIds.includes(row.itemId))
        .reduce((sum, row) => sum + row.estimatedCost, 0)}
      busy={busy}
      error={dialogError}
      onClose={() => { setPurchaseOrderDialogOpen(false); setDialogError(null) }}
      onSubmit={(payload) => {
        applyStoreChange(
          (current) => createPurchaseOrderFromSuggestions(
            current,
            purchaseOrderItemIds,
            payload.requester,
            payload.notes,
          ),
          `已生成采购单（${purchaseOrderItemIds.length} 行）`,
        )
        setPurchaseOrderDialogOpen(false)
        setPurchaseOrderItemIds([])
      }}
    />
    {(() => {
      const postSession = store.stocktakes.find((session) => session.id === stocktakePostSessionId) ?? null
      const postAnalysis = postSession ? analyzeStocktakeVariance(postSession) : null
      return <InventoryStocktakePostDialog
        open={Boolean(postSession && postAnalysis)}
        sessionNumber={postSession?.number ?? ''}
        threshold={STOCKTAKE_VARIANCE_THRESHOLD}
        pendingCount={postAnalysis?.pendingCount ?? 0}
        overThreshold={postAnalysis?.overThreshold ?? []}
        withinCount={postAnalysis?.withinThreshold.length ?? 0}
        totalAbsVariance={postAnalysis?.totalAbsVariance ?? 0}
        busy={busy}
        error={dialogError}
        onClose={() => { setStocktakePostSessionId(null); setDialogError(null) }}
        onConfirm={() => {
          if (!stocktakePostSessionId) return
          applyStoreChange(
            (current) => postStocktake(current, stocktakePostSessionId, '库存管理员'),
            '盘点差异已过账到台账',
          )
          setStocktakePostSessionId(null)
        }}
      />
    })()}
  </>

  if (view === 'overview') {
    const formatCurrency = (value: number) => new Intl.NumberFormat('zh-CN', {
      style: 'currency', currency: 'CNY', maximumFractionDigits: 0,
    }).format(value)

    const go = (next: InventoryView) => onNavigate?.(next)

    return <section className="inventory-panel" aria-label="库存概览">
      {dialogs}
      <div className="inventory-metrics" role="navigation" aria-label="概览指标跳转">
        <button type="button" className="inventory-metric-link" onClick={() => go('ledger')}>
          <span>SKU 总数</span><strong>{summary.total}</strong><small>进入台账</small>
        </button>
        <button type="button" className="inventory-metric-link" onClick={() => go('ledger')}>
          <span>库存估值</span><strong className="inventory-currency">{formatCurrency(summary.valuation)}</strong><small>查看台账</small>
        </button>
        <button type="button" className="inventory-metric-link" onClick={() => go('alerts')}>
          <span>预警</span><strong>{summary.alerts}</strong><small>打开预警中心</small>
        </button>
        <button type="button" className="inventory-metric-link" onClick={() => go('replenish')}>
          <span>补货建议</span><strong>{replenishmentSuggestions.length}</strong><small>打开补货计划</small>
        </button>
        <button type="button" className="inventory-metric-link" onClick={() => go('stocktake')}>
          <span>进行中盘点</span><strong>{summary.stocktakes}</strong><small>打开库位盘点</small>
        </button>
        <button type="button" className="inventory-metric-link" onClick={() => go('batches')}>
          <span>临期/过期批次</span><strong>{summary.batchesAtRisk}</strong><small>打开批次效期</small>
        </button>
      </div>

      <div className="inventory-shortcut-grid" aria-label="库存专属能力">
        <button type="button" className="inventory-shortcut-card" onClick={() => go('alerts')}>
          <strong>预警中心</strong>
          <p>缺货、警戒线、批次效期与库位超容，区别于工单 SLA 风险。</p>
          <span>{summary.alerts} 条待处理 · 点击进入</span>
        </button>
        <button type="button" className="inventory-shortcut-card" onClick={() => go('replenish')}>
          <strong>智能补货</strong>
          <p>按警戒线生成建议量与采购估价，一键按建议入库。</p>
          <span>{replenishmentSuggestions.length} 项建议 · 点击进入</span>
        </button>
        <button type="button" className="inventory-shortcut-card" onClick={() => go('stocktake')}>
          <strong>库位盘点</strong>
          <p>实盘录入、差异计算并过账调整账面 — 工单平台无此流程。</p>
          <span>{summary.stocktakes} 个进行中 · 点击进入</span>
        </button>
        <button type="button" className="inventory-shortcut-card" disabled={!can('inventory.scan')} onClick={openScan}>
          <strong>SKU 扫码</strong>
          <p>模拟扫枪识别 SKU，快速领用/入库/调拨，面向实物作业。</p>
          <span>{can('inventory.scan') ? '点击打开扫码' : '当前角色无扫码权限'}</span>
        </button>
      </div>

      <div className="inventory-overview-grid">
        <section className="inventory-card inventory-chart-card">
          <header className="inventory-list-header">
            <div>
              <div className="inventory-title-row"><h2>库存状态分布</h2></div>
              <p>按当前 mock 台账实时汇总</p>
            </div>
          </header>
          <div className="inventory-chart-body">
            {statusDonut.length > 0
              ? <DonutChart
                items={statusDonut}
                centerLabel="SKU"
                emptyLabel="暂无库存数据"
                onItemActivate={() => go('ledger')}
              />
              : <EmptyState title="暂无库存数据" description="点击右上角新建物资开始录入。" />}
          </div>
        </section>

        <section className="inventory-card inventory-chart-card">
          <header className="inventory-list-header">
            <div>
              <div className="inventory-title-row"><h2>库存估值构成</h2></div>
              <p>按类别估算账面金额（mock 单价）</p>
            </div>
          </header>
          <div className="inventory-chart-body">
            {valuation.categories.length > 0
              ? <StackedCompositionChart
                items={valuation.categories.map((row) => ({ id: row.id, label: row.label, value: row.value, meta: row.meta }))}
                title={formatCurrency(valuation.totalValue)}
                emptyLabel="暂无估值数据"
                onItemActivate={() => go('ledger')}
              />
              : <EmptyState title="暂无估值数据" description="新建物资后将按类别估算。" />}
          </div>
        </section>

        <section className="inventory-card inventory-chart-card inventory-chart-wide">
          <header className="inventory-list-header">
            <div>
              <div className="inventory-title-row"><h2>近 7 日出入库趋势</h2><span className="inventory-count">{summary.movements}</span></div>
              <p>入库（主轴）与领用/负向调整（次轴） · 点击图表跳转流水</p>
            </div>
            <div className="inventory-toolbar-actions">
              <button className="button button-quiet" type="button" disabled={!can('inventory.scan')} onClick={openScan}>扫码作业</button>
              <button className="button button-quiet" type="button" onClick={() => go('movements')}>查看流水</button>
              <button className="button button-quiet" type="button" disabled={!can('inventory.create')} onClick={openCreate}>新建物资</button>
            </div>
          </header>
          <div className="inventory-chart-body">
            <AreaTrendChart
              points={movementTrend}
              primaryLabel="入库"
              secondaryLabel="出库"
              emptyLabel="近 7 日暂无出入库记录"
              onPointActivate={() => go('movements')}
            />
          </div>
        </section>
      </div>

      <section className="inventory-card">
        <header className="inventory-list-header">
          <div>
            <div className="inventory-title-row"><h2>风险物资</h2><span className="inventory-count">{summary.low + summary.out}</span></div>
            <p>偏低与缺货项，可直接发起入库或调整</p>
          </div>
          <button className="button button-quiet" type="button" onClick={() => go('alerts')}>全部预警</button>
        </header>
        {store.items.filter((item) => item.status === 'low' || item.status === 'out').length === 0
          ? <div className="inventory-empty-pad"><EmptyState title="暂无风险物资" description="当前没有偏低或缺货的 SKU。" /></div>
          : <div className="inventory-risk-list">
            {store.items.filter((item) => item.status === 'low' || item.status === 'out').slice(0, 8).map((item) => (
              <article key={item.id} className="inventory-risk-item">
                <button
                  type="button"
                  className="inventory-risk-item-main"
                  onClick={() => { setSelectedId(item.id); go('ledger') }}
                >
                  <StatusBadge status={item.status} label={INVENTORY_STATUS_LABELS[item.status]} variant={statusVariant(item.status)} size="small" />
                  <strong>{item.name}</strong>
                  <small>{item.sku} · {item.location}</small>
                </button>
                <div className="inventory-row-actions">
                  <button className="button button-quiet inventory-mini-button" type="button" disabled={!can('inventory.receive')} onClick={() => openStockAction(item, 'receive')}>入库</button>
                  <button className="button button-quiet inventory-mini-button" type="button" disabled={!can('inventory.adjust')} onClick={() => openStockAction(item, 'adjust')}>调整</button>
                </div>
              </article>
            ))}
          </div>}
      </section>
    </section>
  }

  if (view === 'movements') {
    return <section className="inventory-panel" aria-label="出入库">
      {dialogs}
      <div className="inventory-metrics inventory-metrics-compact" role="toolbar" aria-label="流水类型快捷筛选">
        {([
          { key: 'all', label: '全部', value: store.movements.length, tone: 'neutral' },
          { key: 'inbound', label: '入库', value: movementStats.inbound, tone: 'in' },
          { key: 'outbound', label: '领用', value: movementStats.outbound, tone: 'out' },
          { key: 'transfer', label: '调拨', value: movementStats.transfer, tone: 'transfer' },
          { key: 'adjust', label: '调整', value: movementStats.adjust, tone: 'adjust' },
          { key: 'reserve-group', label: '预留/释放', value: movementStats.reserve, tone: 'reserve' },
        ] as const).map((metric) => <button
          key={metric.key}
          type="button"
          className={`inventory-metric-chip inventory-metric-${metric.tone}${movementTypeFilter === metric.key ? ' is-active' : ''}`}
          onClick={() => {
            setMovementTypeFilter(metric.key)
            setMovementPage(1)
          }}
        >
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </button>)}
      </div>

      <section className="inventory-card">
        <header className="inventory-list-header">
          <div className="inventory-list-heading">
            <div>
              <div className="inventory-title-row"><h2>出入库流水</h2><span className="inventory-count">{filteredMovements.length}</span></div>
              <p>数量方向图标 + 库位/类型筛选；支持快捷入库领用与导出</p>
            </div>
          </div>
          <div className="inventory-toolbar">
            <SearchInput
              value={movementQuery}
              onChange={(value) => { setMovementQuery(value); setMovementPage(1) }}
              onSearch={(value) => { setMovementSearch(value); setMovementPage(1) }}
              onClear={() => { setMovementQuery(''); setMovementSearch(''); setMovementPage(1) }}
              placeholder="搜索流水号、SKU、操作人"
              ariaLabel="搜索出入库流水"
            />
            <FilterBar
              definitions={movementFilterDefinitions}
              values={{ type: movementTypeFilter, location: movementLocationFilter }}
              onChange={(next) => {
                setMovementTypeFilter(String(next.type ?? 'all'))
                setMovementLocationFilter(String(next.location ?? 'all'))
                setMovementPage(1)
              }}
              onReset={() => {
                setMovementTypeFilter('all')
                setMovementLocationFilter('all')
                setMovementPage(1)
              }}
              resetLabel="清除"
            />
            <div className="inventory-toolbar-actions">
              <button className="button button-quiet" type="button" onClick={exportMovementsCsv}>导出 CSV</button>
              <button className="button button-quiet" type="button" disabled={!can('inventory.receive')} onClick={() => openQuickPick('receive')}>快捷入库</button>
              <button className="button button-primary" type="button" disabled={!can('inventory.issue')} onClick={() => openQuickPick('issue')}>快捷领用</button>
            </div>
          </div>
        </header>

        <DataTable
          data={movementRows}
          columns={movementColumns}
          rowKey={(movement) => movement.id}
          ariaLabel="出入库流水列表"
          emptyTitle="没有匹配的流水记录"
          emptyDescription="调整筛选条件，或先执行入库、领用、调拨等操作。"
          onRowClick={(movement) => setSelectedMovementId(movement.id)}
          selectedRowKeys={selectedMovementId ? [selectedMovementId] : []}
        />

        <footer className="inventory-footer">
          <span>显示 <strong>{filteredMovements.length === 0 ? 0 : (currentMovementPage - 1) * movementPageSize + 1}–{Math.min(currentMovementPage * movementPageSize, filteredMovements.length)}</strong> / {filteredMovements.length}</span>
          <Pagination
            page={currentMovementPage}
            pageSize={movementPageSize}
            total={filteredMovements.length}
            pageSizeOptions={[10, 20, 40]}
            onPageChange={setMovementPage}
            onPageSizeChange={(size) => { setMovementPageSize(size); setMovementPage(1) }}
          />
        </footer>
      </section>

      <DetailPanel
        open={Boolean(selectedMovement)}
        title={selectedMovement ? INVENTORY_MOVEMENT_LABELS[selectedMovement.type] : undefined}
        subtitle={selectedMovement?.number}
        size="medium"
        onClose={() => setSelectedMovementId(null)}
        footer={selectedMovement ? <div className="inventory-detail-actions">
          {selectedMovementItem && <>
            <button className="button button-quiet" type="button" disabled={!can('inventory.receive')} onClick={() => openStockAction(selectedMovementItem, 'receive')}>再次入库</button>
            <button className="button button-quiet" type="button" disabled={!can('inventory.issue')} onClick={() => openStockAction(selectedMovementItem, 'issue')}>再次领用</button>
            <button className="button button-primary" type="button" disabled={!can('inventory.edit')} onClick={() => {
              if (selectedMovementItem) openEdit(selectedMovementItem)
            }}>编辑物资</button>
          </>}
        </div> : undefined}
      >
        {selectedMovement && <>
          <div className="inventory-detail-status inventory-detail-status-row">
            <StatusBadge
              status={selectedMovement.type}
              label={INVENTORY_MOVEMENT_LABELS[selectedMovement.type]}
              variant={movementBadgeVariant(selectedMovement.type)}
              size="small"
            />
            <MovementQuantityBadge
              type={selectedMovement.type}
              quantity={selectedMovement.quantity}
              unit={selectedMovementItem?.unit}
            />
          </div>
          <dl className="inventory-detail-grid">
            <div><dt>物资</dt><dd>{selectedMovement.itemName}</dd></div>
            <div><dt>SKU</dt><dd className="inventory-mono">{selectedMovement.sku}</dd></div>
            <div><dt>操作人</dt><dd>{selectedMovement.operator}</dd></div>
            <div><dt>发生时间</dt><dd>{formatDate(selectedMovement.occurredAt)}</dd></div>
            <div><dt>关联工单</dt><dd>{selectedMovement.relatedWorkOrder ?? '—'}</dd></div>
            <div><dt>库位变化</dt><dd><LocationRoute from={selectedMovement.fromLocation} to={selectedMovement.toLocation} /></dd></div>
          </dl>
          <p className="inventory-notes">{selectedMovement.reason}</p>
          {selectedMovementItem && <div className="inventory-timeline-block">
            <h4>同物资最近流水</h4>
            <Timeline
              items={movementsForItem(store, selectedMovementItem.id).slice(0, 8).map((movement) => ({
                id: movement.id,
                title: `${INVENTORY_MOVEMENT_LABELS[movement.type]} · ${movement.quantity}${selectedMovementItem.unit}`,
                description: movement.reason,
                meta: <small>{movement.number}</small>,
                time: formatDate(movement.occurredAt),
                tone: movementTone(movement.type),
              }))}
              emptyLabel="暂无相关流水"
              ariaLabel="同物资流水"
            />
          </div>}
        </>}
      </DetailPanel>
    </section>
  }

  if (view === 'alerts') {
    return <section className="inventory-panel" aria-label="库存预警">
      {dialogs}
      <div className="inventory-metrics">
        <article><span>预警总数</span><strong>{inventoryAlerts.length}</strong></article>
        <article><span>缺货</span><strong>{inventoryAlerts.filter((alert) => alert.kind === 'out').length}</strong></article>
        <article><span>低于警戒</span><strong>{inventoryAlerts.filter((alert) => alert.kind === 'low').length}</strong></article>
        <article><span>临期/过期批次</span><strong>{inventoryAlerts.filter((alert) => alert.kind === 'expiring' || alert.kind === 'expired').length}</strong></article>
        <article><span>超容库位</span><strong>{inventoryAlerts.filter((alert) => alert.kind === 'overstock').length}</strong></article>
      </div>
      <InventoryAlertsView
        alerts={inventoryAlerts}
        items={store.items}
        canReplenish={can('inventory.receive')}
        canEdit={can('inventory.edit')}
        onReplenish={(item) => openStockAction(item, 'receive')}
        onOpenItem={(item) => { setSelectedId(item.id); openEdit(item) }}
      />
    </section>
  }

  if (view === 'replenish') {
    return <section className="inventory-panel" aria-label="补货计划">
      {dialogs}
      <InventoryReplenishView
        suggestions={replenishmentSuggestions}
        items={store.items}
        purchaseOrders={store.purchaseOrders}
        canReceive={can('inventory.receive')}
        canEdit={can('inventory.edit')}
        canCreatePurchase={can('inventory.purchase.create')}
        canReceivePurchase={can('inventory.purchase.receive')}
        canCancelPurchase={can('inventory.purchase.cancel')}
        onReceive={(item) => openStockAction(item, 'receive')}
        onReceiveSuggested={(item, quantity) => {
          if (!ensure('inventory.receive')) return
          applyStoreChange(
            (current) => receiveInventory(current, {
              itemId: item.id,
              quantity,
              reason: `补货计划建议入库（目标警戒线 x2）`,
              operator: '库存管理员',
            }),
            `已按建议为 ${item.name} 入库 ${quantity}${item.unit}`,
          )
        }}
        onOpenItem={(item) => openEdit(item)}
        onCreatePurchaseOrder={openPurchaseOrder}
        onReceivePurchaseOrder={(orderId) => {
          if (!ensure('inventory.purchase.receive')) return
          applyStoreChange(
            (current) => receivePurchaseOrder(current, orderId, '库存管理员'),
            '采购单已收货并写入入库流水',
          )
        }}
        onCancelPurchaseOrder={(orderId) => {
          if (!ensure('inventory.purchase.cancel')) return
          applyStoreChange((current) => cancelPurchaseOrder(current, orderId), '采购单已取消')
        }}
      />
    </section>
  }

  if (view === 'batches') {
    return <section className="inventory-panel" aria-label="批次效期">
      {dialogs}
      <InventoryBatchesView
        batches={store.batches}
        items={store.items}
        locations={store.locations.map((location) => location.name)}
        canIssue={can('inventory.issue')}
        canReceive={can('inventory.receive')}
        canEdit={can('inventory.edit')}
        onIssuePrefer={(batch) => {
          const item = store.items.find((entry) => entry.id === batch.itemId)
          if (!item) {
            setNotice({ kind: 'error', message: '未找到对应物资。' })
            return
          }
          openStockAction(item, 'issue')
          setNotice({
            kind: 'info',
            message: batch.status === 'expired'
              ? `优先隔离批次 ${batch.lotNumber}`
              : `建议优先领用临期批次 ${batch.lotNumber}`,
          })
        }}
        onReceive={(item) => openStockAction(item, 'receive')}
        onOpenItem={(item) => {
          setSelectedId(item.id)
          openEdit(item)
          setNotice({ kind: 'info', message: `已打开物资 ${item.name}（${item.sku}）` })
        }}
      />
    </section>
  }

  if (view === 'stocktake') {
    return <>
      {dialogs}
      <InventoryStocktakeView
        sessions={store.stocktakes}
        busy={busy}
        canStocktake={can('inventory.stocktake')}
        canPost={can('inventory.stocktake.post')}
        onStart={openStocktake}
        onCountChange={(sessionId, itemId, countedQuantity) => {
          if (!ensure('inventory.stocktake')) return
          try {
            setStore((current) => updateStocktakeCount(current, sessionId, itemId, countedQuantity))
          } catch (error) {
            setNotice({ kind: 'error', message: error instanceof Error ? error.message : '录入失败' })
          }
        }}
        onSubmitReview={(sessionId) => {
          if (!ensure('inventory.stocktake')) return
          applyStoreChange((current) => markStocktakeReview(current, sessionId), '盘点已提交复核')
        }}
        onRequestPost={openStocktakePost}
      />
    </>
  }

  if (view === 'locations') {
    return <section className="inventory-panel" aria-label="库位">
      {dialogs}
      <section className="inventory-card inventory-chart-card">
        <header className="inventory-list-header">
          <div>
            <div className="inventory-title-row"><h2>库位容量</h2><span className="inventory-count">{locationSummaries.length}</span></div>
            <p>结合库位容量与当前账面数量计算利用率</p>
          </div>
        </header>
        <div className="inventory-chart-body">
          <CapacityGaugeChart items={capacityItems} emptyLabel="暂无库位容量数据" />
        </div>
      </section>

      <section className="inventory-card">
        <header className="inventory-list-header">
          <div>
            <div className="inventory-title-row"><h2>库位一览</h2><span className="inventory-count">{locationSummaries.length}</span></div>
            <p>管理员、分区、SKU 与风险项汇总</p>
          </div>
        </header>
        <div className="inventory-location-grid">
          {locationSummaries.map((row) => {
            const tone = row.utilization >= 90 ? 'danger' : row.utilization >= 70 || row.lowOrOut > 0 ? 'warn' : 'ok'
            return <article key={row.id} className={`inventory-location-card inventory-location-card-${tone}`}>
              <div className="inventory-location-card-head">
                <strong>{row.name}</strong>
                <StatusBadge
                  status={row.isActive ? 'active' : 'inactive'}
                  label={row.isActive ? '启用' : '停用'}
                  variant={row.isActive ? 'success' : 'neutral'}
                  size="small"
                />
              </div>
              <p>{row.zone} · 管理员 {row.manager}</p>
              <p>{row.skus} 个 SKU · 存量 {row.quantity} · 可用 {row.available}</p>
              <small>
                容量 {row.capacity} · 利用率 {row.utilization}%
                {row.lowOrOut > 0 ? ` · ${row.lowOrOut} 项偏低/缺货` : ' · 库存正常'}
              </small>
              <div className="inventory-location-meter" aria-hidden="true">
                <span style={{ width: `${Math.min(100, row.utilization)}%` }} />
              </div>
              <div className="inventory-row-actions">
                <button
                  className="button button-quiet inventory-mini-button"
                  type="button"
                  disabled={!can('inventory.transfer')}
                  onClick={() => {
                    const item = store.items.find((entry) => entry.location === row.name)
                    if (item) openStockAction(item, 'transfer')
                    else setNotice({ kind: 'info', message: `${row.name} 暂无物资可调拨。` })
                  }}
                >从此调拨</button>
                <button
                  className="button button-quiet inventory-mini-button"
                  type="button"
                  disabled={!can('inventory.receive')}
                  onClick={() => {
                    const item = store.items.find((entry) => entry.location === row.name && (entry.status === 'low' || entry.status === 'out'))
                      ?? store.items.find((entry) => entry.location === row.name)
                    if (item) openStockAction(item, 'receive')
                    else setNotice({ kind: 'info', message: `${row.name} 暂无物资可入库。` })
                  }}
                >补货入库</button>
              </div>
            </article>
          })}
        </div>
      </section>
    </section>
  }

  return <section className="inventory-panel" aria-label="库存台账">
    {dialogs}
    <section className="inventory-card">
      <header className="inventory-list-header">
        <div className="inventory-list-heading">
          <div>
            <div className="inventory-title-row"><h2>库存台账</h2><span className="inventory-count">{filtered.length}</span></div>
            <p>本地 mock {store.items.length} 条 · 支持入库/领用/调拨/预留与批量调拨</p>
          </div>
        </div>
        <div className="inventory-toolbar">
          <SearchInput
            value={query}
            onChange={(value) => { setQuery(value); setPage(1) }}
            onSearch={(value) => { setSearch(value); setPage(1) }}
            onClear={() => { setQuery(''); setSearch(''); setPage(1) }}
            placeholder="搜索 SKU、名称、库位"
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
            resetLabel="清除"
          />
          <div className="inventory-toolbar-actions">
            <button className="button button-primary" type="button" disabled={!can('inventory.create')} onClick={openCreate}>新建物资</button>
          </div>
        </div>
      </header>

      {selectedKeys.length > 0 && <div className="inventory-bulk-wrap">
        <BulkActionBar
          selectedCount={selectedKeys.length}
          actions={[
            { id: 'bulk-transfer', label: '批量调拨', disabled: !can('inventory.transfer') },
            { id: 'bulk-reserve', label: '批量预留', disabled: selectedKeys.length !== 1 || !can('inventory.reserve') },
          ]}
          onAction={(actionId) => {
            if (actionId === 'bulk-transfer') {
              openBulkTransfer()
              return
            }
            if (actionId === 'bulk-reserve' && selectedKeys[0]) {
              const item = store.items.find((entry) => entry.id === selectedKeys[0])
              if (item) openStockAction(item, 'reserve')
            }
          }}
          onClear={() => setSelectedKeys([])}
          busy={busy}
        />
      </div>}

      <DataTable
        data={pageRows}
        columns={columns}
        rowKey={(item) => item.id}
        ariaLabel="库存列表"
        emptyTitle="没有匹配的库存记录"
        emptyDescription="调整筛选条件，或新建物资写入台账。"
        emptyAction={<button className="button button-primary" type="button" disabled={!can('inventory.create')} onClick={openCreate}>新建物资</button>}
        onRowClick={(item) => setSelectedId(item.id)}
        selectedRowKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
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

    <DetailPanel
      open={Boolean(selected)}
      title={selected?.name}
      subtitle={selected ? `${selected.sku} · ${selected.location}` : undefined}
      size="medium"
      onClose={() => setSelectedId(null)}
      footer={selected ? <div className="inventory-detail-actions">
        <button className="button button-quiet" type="button" disabled={!can('inventory.receive')} onClick={() => openStockAction(selected, 'receive')}>入库</button>
        <button className="button button-quiet" type="button" disabled={!can('inventory.issue')} onClick={() => openStockAction(selected, 'issue')}>领用</button>
        <button className="button button-quiet" type="button" disabled={!can('inventory.adjust')} onClick={() => openStockAction(selected, 'adjust')}>调整</button>
        <button className="button button-quiet" type="button" disabled={!can('inventory.transfer')} onClick={() => openStockAction(selected, 'transfer')}>调拨</button>
        <button className="button button-quiet" type="button" disabled={!can('inventory.reserve')} onClick={() => openStockAction(selected, 'reserve')}>预留</button>
        <button className="button button-quiet" type="button" disabled={!can('inventory.reserve')} onClick={() => openStockAction(selected, 'release')}>释放</button>
        <button className="button button-primary" type="button" disabled={!can('inventory.edit')} onClick={() => openEdit(selected)}>编辑</button>
      </div> : undefined}
    >
      {selected && <>
        <div className="inventory-detail-status">
          <StatusBadge status={selected.status} label={INVENTORY_STATUS_LABELS[selected.status]} variant={statusVariant(selected.status)} size="small" />
        </div>
        <dl className="inventory-detail-grid">
          <div><dt>类别</dt><dd>{selected.category}</dd></div>
          <div><dt>库位</dt><dd>{selected.location}</dd></div>
          <div><dt>账面数量</dt><dd>{selected.quantity} {selected.unit}</dd></div>
          <div><dt>预留 / 可用</dt><dd>{selected.reservedQuantity} / {availableQuantity(selected)}</dd></div>
          <div><dt>警戒线</dt><dd>{selected.reorderPoint}</dd></div>
          <div><dt>责任组</dt><dd>{selected.owner}</dd></div>
          <div><dt>创建时间</dt><dd>{formatDate(selected.createdAt)}</dd></div>
          <div><dt>更新时间</dt><dd>{formatDate(selected.updatedAt)}</dd></div>
        </dl>
        {selected.notes && <p className="inventory-notes">{selected.notes}</p>}
        <div className="inventory-timeline-block">
          <h4>批次 / 效期</h4>
          {selectedBatches.length === 0
            ? <p className="inventory-muted">暂无批次记录</p>
            : <div className="inventory-row-actions" style={{ marginBottom: 12 }}>
              {selectedBatches.map((batch) => <span
                key={batch.id}
                className={`inventory-batch-chip${batch.status === 'expiring' || batch.status === 'expired' ? ` is-${batch.status}` : ''}`}
                title={batch.supplier}
              >
                {batch.lotNumber} · {batch.quantity}{selected.unit} · {INVENTORY_BATCH_STATUS_LABELS[batch.status]}
                {batch.expiresAt ? ` · 到期 ${new Date(batch.expiresAt).toLocaleDateString('zh-CN')}` : ''}
              </span>)}
            </div>}
          <h4>库存流水</h4>
          <Timeline items={timelineItems} emptyLabel="暂无出入库记录" ariaLabel="物资库存流水" />
        </div>
      </>}
    </DetailPanel>
  </section>
}
