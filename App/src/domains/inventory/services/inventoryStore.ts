import {
  sampleInventoryBatches,
  sampleInventoryItems,
  sampleInventoryLocations,
  sampleInventoryMovements,
  sampleStocktakeSessions,
} from '../data/sampleInventory'
import {
  availableQuantity,
  deriveBatchStatus,
  deriveInventoryStatus,
  estimateUnitCost,
  type InventoryAdjustInput,
  type InventoryAlert,
  type InventoryBatch,
  type InventoryItem,
  type InventoryItemInput,
  type InventoryIssueInput,
  type InventoryLocation,
  type InventoryLocationSummary,
  type InventoryMovement,
  type InventoryReceiveInput,
  type InventoryReserveInput,
  type InventoryTransferInput,
  type ReplenishmentSuggestion,
  type StocktakeSession,
} from '../types/inventory.types'

export interface InventoryStoreState {
  items: InventoryItem[]
  movements: InventoryMovement[]
  locations: InventoryLocation[]
  batches: InventoryBatch[]
  stocktakes: StocktakeSession[]
}

function cloneInitialState(): InventoryStoreState {
  return {
    items: sampleInventoryItems.map((item) => ({ ...item })),
    movements: sampleInventoryMovements.map((movement) => ({ ...movement })),
    locations: sampleInventoryLocations.map((location) => ({ ...location })),
    batches: sampleInventoryBatches.map((batch) => ({
      ...batch,
      status: deriveBatchStatus(batch.quantity, batch.expiresAt),
    })),
    stocktakes: sampleStocktakeSessions.map((session) => ({
      ...session,
      lines: session.lines.map((line) => ({ ...line })),
    })),
  }
}

function nowIso() {
  return new Date().toISOString()
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nextMovementNumber(movements: InventoryMovement[]) {
  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replaceAll('-', '')
  const seq = String(movements.filter((item) => item.number.includes(stamp)).length + 1).padStart(3, '0')
  return `MV-${stamp}-${seq}`
}

function withDerivedStatus(item: InventoryItem): InventoryItem {
  return {
    ...item,
    status: deriveInventoryStatus(item.quantity, item.reservedQuantity, item.reorderPoint),
  }
}

function requireItem(state: InventoryStoreState, itemId: string) {
  const item = state.items.find((entry) => entry.id === itemId)
  if (!item) throw new Error('未找到对应物资。')
  return item
}

function prependMovement(
  state: InventoryStoreState,
  partial: Omit<InventoryMovement, 'id' | 'number' | 'occurredAt'> & { occurredAt?: string },
): InventoryStoreState {
  const movement: InventoryMovement = {
    ...partial,
    id: nextId('mv'),
    number: nextMovementNumber(state.movements),
    occurredAt: partial.occurredAt ?? nowIso(),
  }
  return { ...state, movements: [movement, ...state.movements] }
}

function replaceItem(state: InventoryStoreState, nextItem: InventoryItem): InventoryStoreState {
  return {
    ...state,
    items: state.items.map((item) => (item.id === nextItem.id ? withDerivedStatus(nextItem) : item)),
  }
}

export function createInventoryStoreState(): InventoryStoreState {
  return cloneInitialState()
}

export function resetInventoryStoreState(): InventoryStoreState {
  return cloneInitialState()
}

export function createInventoryItem(state: InventoryStoreState, input: InventoryItemInput): InventoryStoreState {
  const sku = input.sku.trim().toUpperCase()
  const name = input.name.trim()
  if (!sku) throw new Error('请填写 SKU。')
  if (!name) throw new Error('请填写物资名称。')
  if (state.items.some((item) => item.sku.toLocaleLowerCase() === sku.toLocaleLowerCase())) {
    throw new Error(`SKU ${sku} 已存在。`)
  }
  if (!input.location.trim()) throw new Error('请选择库位。')
  if (input.quantity < 0) throw new Error('初始数量不能为负数。')
  if (input.reorderPoint < 0) throw new Error('警戒线不能为负数。')

  const timestamp = nowIso()
  const item = withDerivedStatus({
    id: nextId('inv'),
    sku,
    name,
    category: input.category,
    location: input.location.trim(),
    quantity: Math.floor(input.quantity),
    reservedQuantity: 0,
    reorderPoint: Math.floor(input.reorderPoint),
    status: 'in-stock',
    owner: input.owner,
    unit: input.unit.trim() || '台',
    notes: input.notes.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  let next = { ...state, items: [item, ...state.items] }
  if (item.quantity > 0) {
    next = prependMovement(next, {
      type: 'inbound',
      itemId: item.id,
      sku: item.sku,
      itemName: item.name,
      quantity: item.quantity,
      fromLocation: null,
      toLocation: item.location,
      operator: '库存管理员',
      reason: '新建物资初始入库',
      relatedWorkOrder: null,
    })
  }
  return next
}

export function updateInventoryItem(
  state: InventoryStoreState,
  itemId: string,
  input: Omit<InventoryItemInput, 'quantity'>,
): InventoryStoreState {
  const current = requireItem(state, itemId)
  const sku = input.sku.trim().toUpperCase()
  const name = input.name.trim()
  if (!sku) throw new Error('请填写 SKU。')
  if (!name) throw new Error('请填写物资名称。')
  if (state.items.some((item) => item.id !== itemId && item.sku.toLocaleLowerCase() === sku.toLocaleLowerCase())) {
    throw new Error(`SKU ${sku} 已存在。`)
  }
  if (!input.location.trim()) throw new Error('请选择库位。')
  if (input.reorderPoint < 0) throw new Error('警戒线不能为负数。')

  const locationChanged = current.location !== input.location.trim()
  let next = replaceItem(state, {
    ...current,
    sku,
    name,
    category: input.category,
    location: input.location.trim(),
    reorderPoint: Math.floor(input.reorderPoint),
    owner: input.owner,
    unit: input.unit.trim() || current.unit,
    notes: input.notes.trim(),
    updatedAt: nowIso(),
  })

  if (locationChanged && current.quantity > 0) {
    next = prependMovement(next, {
      type: 'transfer',
      itemId: current.id,
      sku,
      itemName: name,
      quantity: current.quantity,
      fromLocation: current.location,
      toLocation: input.location.trim(),
      operator: '库存管理员',
      reason: '编辑物资时调整库位',
      relatedWorkOrder: null,
    })
  }

  return next
}

export function adjustInventoryQuantity(state: InventoryStoreState, input: InventoryAdjustInput): InventoryStoreState {
  const current = requireItem(state, input.itemId)
  const delta = Math.trunc(input.delta)
  if (delta === 0) throw new Error('调整数量不能为 0。')
  if (!input.reason.trim()) throw new Error('请填写调整原因。')
  const nextQuantity = current.quantity + delta
  if (nextQuantity < 0) throw new Error('调整后数量不能为负数。')
  if (nextQuantity < current.reservedQuantity) {
    throw new Error(`调整后数量不能低于已预留数量 ${current.reservedQuantity}。`)
  }

  let next = replaceItem(state, {
    ...current,
    quantity: nextQuantity,
    updatedAt: nowIso(),
  })
  next = prependMovement(next, {
    type: 'adjust',
    itemId: current.id,
    sku: current.sku,
    itemName: current.name,
    quantity: delta,
    fromLocation: current.location,
    toLocation: current.location,
    operator: input.operator.trim() || '库存管理员',
    reason: input.reason.trim(),
    relatedWorkOrder: null,
  })
  return next
}

export function receiveInventory(state: InventoryStoreState, input: InventoryReceiveInput): InventoryStoreState {
  const current = requireItem(state, input.itemId)
  const quantity = Math.floor(input.quantity)
  if (quantity <= 0) throw new Error('入库数量必须大于 0。')
  if (!input.reason.trim()) throw new Error('请填写入库原因。')

  let next = replaceItem(state, {
    ...current,
    quantity: current.quantity + quantity,
    updatedAt: nowIso(),
  })
  next = prependMovement(next, {
    type: 'inbound',
    itemId: current.id,
    sku: current.sku,
    itemName: current.name,
    quantity,
    fromLocation: null,
    toLocation: current.location,
    operator: input.operator.trim() || '库存管理员',
    reason: input.reason.trim(),
    relatedWorkOrder: null,
  })
  return next
}

export function issueInventory(state: InventoryStoreState, input: InventoryIssueInput): InventoryStoreState {
  const current = requireItem(state, input.itemId)
  const quantity = Math.floor(input.quantity)
  if (quantity <= 0) throw new Error('领用数量必须大于 0。')
  if (!input.reason.trim()) throw new Error('请填写领用原因。')
  const available = availableQuantity(current)
  if (quantity > available) throw new Error(`可领用数量不足，当前可用 ${available}。`)

  let next = replaceItem(state, {
    ...current,
    quantity: current.quantity - quantity,
    updatedAt: nowIso(),
  })
  next = prependMovement(next, {
    type: 'outbound',
    itemId: current.id,
    sku: current.sku,
    itemName: current.name,
    quantity,
    fromLocation: current.location,
    toLocation: null,
    operator: input.operator.trim() || '库存管理员',
    reason: input.reason.trim(),
    relatedWorkOrder: input.relatedWorkOrder?.trim() || null,
  })
  return next
}

export function transferInventory(state: InventoryStoreState, input: InventoryTransferInput): InventoryStoreState {
  const current = requireItem(state, input.itemId)
  const quantity = Math.floor(input.quantity)
  const toLocation = input.toLocation.trim()
  if (quantity <= 0) throw new Error('调拨数量必须大于 0。')
  if (!toLocation) throw new Error('请选择目标库位。')
  if (toLocation === current.location) throw new Error('目标库位不能与当前库位相同。')
  if (!input.reason.trim()) throw new Error('请填写调拨原因。')
  if (quantity > current.quantity) throw new Error(`库存不足，当前数量 ${current.quantity}。`)
  if (quantity === current.quantity && current.reservedQuantity > 0) {
    // whole-lot transfer keeps reserved quantity with the item
  } else if (quantity < current.quantity && availableQuantity(current) < quantity) {
    throw new Error(`可用数量不足（已预留 ${current.reservedQuantity}），无法部分调拨。`)
  }

  if (quantity === current.quantity) {
    let next = replaceItem(state, {
      ...current,
      location: toLocation,
      updatedAt: nowIso(),
    })
    next = prependMovement(next, {
      type: 'transfer',
      itemId: current.id,
      sku: current.sku,
      itemName: current.name,
      quantity,
      fromLocation: current.location,
      toLocation,
      operator: input.operator.trim() || '库存管理员',
      reason: input.reason.trim(),
      relatedWorkOrder: null,
    })
    return next
  }

  // Partial transfer: split into a sibling SKU lot at destination is complex;
  // for mock UX we reduce source and create a destination twin only when SKU+location unique.
  // Simpler rule for demo: require full quantity transfer OR transfer only available and update location if all moved.
  // Instead: reduce quantity at source and increase/create at destination with same SKU.
  const remainingReserved = Math.min(current.reservedQuantity, current.quantity - quantity)
  let next = replaceItem(state, {
    ...current,
    quantity: current.quantity - quantity,
    reservedQuantity: remainingReserved,
    updatedAt: nowIso(),
  })

  const existingTarget = next.items.find(
    (item) => item.sku === current.sku && item.location === toLocation && item.id !== current.id,
  )
  if (existingTarget) {
    next = replaceItem(next, {
      ...existingTarget,
      quantity: existingTarget.quantity + quantity,
      updatedAt: nowIso(),
    })
  } else {
    const timestamp = nowIso()
    const moved = withDerivedStatus({
      ...current,
      id: nextId('inv'),
      location: toLocation,
      quantity,
      reservedQuantity: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      notes: current.notes ? `${current.notes}（调拨拆分）` : '由调拨拆分生成',
    })
    next = { ...next, items: [moved, ...next.items] }
  }

  next = prependMovement(next, {
    type: 'transfer',
    itemId: current.id,
    sku: current.sku,
    itemName: current.name,
    quantity,
    fromLocation: current.location,
    toLocation,
    operator: input.operator.trim() || '库存管理员',
    reason: input.reason.trim(),
    relatedWorkOrder: null,
  })
  return next
}

export function reserveInventory(state: InventoryStoreState, input: InventoryReserveInput): InventoryStoreState {
  const current = requireItem(state, input.itemId)
  const quantity = Math.floor(input.quantity)
  if (quantity <= 0) throw new Error('预留数量必须大于 0。')
  if (!input.reason.trim()) throw new Error('请填写预留原因。')
  if (quantity > availableQuantity(current)) {
    throw new Error(`可预留数量不足，当前可用 ${availableQuantity(current)}。`)
  }

  let next = replaceItem(state, {
    ...current,
    reservedQuantity: current.reservedQuantity + quantity,
    updatedAt: nowIso(),
  })
  next = prependMovement(next, {
    type: 'reserve',
    itemId: current.id,
    sku: current.sku,
    itemName: current.name,
    quantity,
    fromLocation: current.location,
    toLocation: null,
    operator: input.operator.trim() || '库存管理员',
    reason: input.reason.trim(),
    relatedWorkOrder: null,
  })
  return next
}

export function releaseInventoryReserve(state: InventoryStoreState, input: InventoryReserveInput): InventoryStoreState {
  const current = requireItem(state, input.itemId)
  const quantity = Math.floor(input.quantity)
  if (quantity <= 0) throw new Error('释放数量必须大于 0。')
  if (!input.reason.trim()) throw new Error('请填写释放原因。')
  if (quantity > current.reservedQuantity) {
    throw new Error(`预留不足，当前预留 ${current.reservedQuantity}。`)
  }

  let next = replaceItem(state, {
    ...current,
    reservedQuantity: current.reservedQuantity - quantity,
    updatedAt: nowIso(),
  })
  next = prependMovement(next, {
    type: 'release',
    itemId: current.id,
    sku: current.sku,
    itemName: current.name,
    quantity,
    fromLocation: current.location,
    toLocation: null,
    operator: input.operator.trim() || '库存管理员',
    reason: input.reason.trim(),
    relatedWorkOrder: null,
  })
  return next
}

export function bulkTransferInventory(
  state: InventoryStoreState,
  itemIds: string[],
  toLocation: string,
  reason: string,
  operator: string,
): { state: InventoryStoreState; success: number; failed: Array<{ id: string; message: string }> } {
  let next = state
  let success = 0
  const failed: Array<{ id: string; message: string }> = []
  itemIds.forEach((itemId) => {
    const item = next.items.find((entry) => entry.id === itemId)
    if (!item) {
      failed.push({ id: itemId, message: '物资不存在' })
      return
    }
    try {
      next = transferInventory(next, {
        itemId,
        quantity: item.quantity,
        toLocation,
        reason,
        operator,
      })
      success += 1
    } catch (error) {
      failed.push({ id: itemId, message: error instanceof Error ? error.message : '调拨失败' })
    }
  })
  return { state: next, success, failed }
}

export function summarizeLocations(state: InventoryStoreState): InventoryLocationSummary[] {
  return state.locations.map((location) => {
    const rows = state.items.filter((item) => item.location === location.name)
    const quantity = rows.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = rows.reduce((sum, item) => sum + item.reservedQuantity, 0)
    const lowOrOut = rows.filter((item) => item.status === 'low' || item.status === 'out').length
    return {
      ...location,
      skus: rows.length,
      quantity,
      reserved,
      available: Math.max(0, quantity - reserved),
      lowOrOut,
      utilization: location.capacity > 0 ? Math.min(100, Math.round((quantity / location.capacity) * 100)) : 0,
    }
  })
}

export function movementsForItem(state: InventoryStoreState, itemId: string) {
  return state.movements.filter((movement) => movement.itemId === itemId)
}

export function batchesForItem(state: InventoryStoreState, itemId: string) {
  return state.batches.filter((batch) => batch.itemId === itemId)
}

export function buildInventoryAlerts(state: InventoryStoreState): InventoryAlert[] {
  const alerts: InventoryAlert[] = []
  const now = Date.now()

  state.items.forEach((item) => {
    if (item.status === 'out') {
      alerts.push({
        id: `alert-out-${item.id}`,
        kind: 'out',
        severity: 'critical',
        title: `${item.name} 缺货`,
        description: `SKU ${item.sku} 当前为 0，建议立即补货到警戒线 ${item.reorderPoint} 以上。`,
        itemId: item.id,
        batchId: null,
        location: item.location,
        occurredAt: item.updatedAt,
      })
    } else if (item.status === 'low') {
      alerts.push({
        id: `alert-low-${item.id}`,
        kind: 'low',
        severity: 'high',
        title: `${item.name} 低于警戒线`,
        description: `账面 ${item.quantity}${item.unit}，警戒线 ${item.reorderPoint}${item.unit}，可用 ${availableQuantity(item)}${item.unit}。`,
        itemId: item.id,
        batchId: null,
        location: item.location,
        occurredAt: item.updatedAt,
      })
    }
  })

  state.batches.forEach((batch) => {
    const status = deriveBatchStatus(batch.quantity, batch.expiresAt, now)
    if (status === 'expired') {
      alerts.push({
        id: `alert-expired-${batch.id}`,
        kind: 'expired',
        severity: 'critical',
        title: `批次 ${batch.lotNumber} 已过期`,
        description: `${batch.itemName} 仍有 ${batch.quantity} 件，建议隔离并走报废/退货流程。`,
        itemId: batch.itemId,
        batchId: batch.id,
        location: batch.location,
        occurredAt: batch.expiresAt ?? batch.receivedAt,
      })
    } else if (status === 'expiring') {
      alerts.push({
        id: `alert-expiring-${batch.id}`,
        kind: 'expiring',
        severity: 'medium',
        title: `批次 ${batch.lotNumber} 临期`,
        description: `${batch.itemName} 将于 ${batch.expiresAt ? new Date(batch.expiresAt).toLocaleDateString('zh-CN') : '—'} 到期，优先出库。`,
        itemId: batch.itemId,
        batchId: batch.id,
        location: batch.location,
        occurredAt: batch.expiresAt ?? batch.receivedAt,
      })
    }
  })

  summarizeLocations(state).forEach((location) => {
    if (location.utilization >= 95) {
      alerts.push({
        id: `alert-overstock-${location.id}`,
        kind: 'overstock',
        severity: 'high',
        title: `${location.name} 接近满仓`,
        description: `利用率 ${location.utilization}%（${location.quantity}/${location.capacity}），建议调拨或扩容。`,
        itemId: null,
        batchId: null,
        location: location.name,
        occurredAt: nowIso(),
      })
    }
  })

  const severityRank = { critical: 0, high: 1, medium: 2 }
  return alerts.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
    || right.occurredAt.localeCompare(left.occurredAt))
}

export function startStocktake(
  state: InventoryStoreState,
  location: string,
  operator: string,
  notes = '',
): InventoryStoreState {
  const target = location.trim()
  if (!target) throw new Error('请选择盘点库位。')
  if (state.stocktakes.some((session) => session.location === target && (session.status === 'counting' || session.status === 'review' || session.status === 'draft'))) {
    throw new Error(`${target} 已有进行中的盘点任务。`)
  }
  const lines = state.items
    .filter((item) => item.location === target)
    .map((item) => ({
      itemId: item.id,
      sku: item.sku,
      itemName: item.name,
      systemQuantity: item.quantity,
      countedQuantity: null as number | null,
      unit: item.unit,
    }))
  if (lines.length === 0) throw new Error(`${target} 没有可盘点物资。`)

  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replaceAll('-', '')
  const session: StocktakeSession = {
    id: nextId('st'),
    number: `ST-${stamp}-${String(state.stocktakes.filter((item) => item.number.includes(stamp)).length + 1).padStart(2, '0')}`,
    location: target,
    status: 'counting',
    operator: operator.trim() || '库存管理员',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    postedAt: null,
    notes: notes.trim() || `${target} 库位盘点`,
    lines,
  }
  return { ...state, stocktakes: [session, ...state.stocktakes] }
}

export function updateStocktakeCount(
  state: InventoryStoreState,
  sessionId: string,
  itemId: string,
  countedQuantity: number,
): InventoryStoreState {
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) throw new Error('实盘数量不能为负数。')
  const session = state.stocktakes.find((entry) => entry.id === sessionId)
  if (!session) throw new Error('未找到盘点任务。')
  if (session.status === 'posted') throw new Error('已过账盘点不可修改。')

  return {
    ...state,
    stocktakes: state.stocktakes.map((entry) => {
      if (entry.id !== sessionId) return entry
      return {
        ...entry,
        status: entry.status === 'draft' ? 'counting' : entry.status,
        updatedAt: nowIso(),
        lines: entry.lines.map((line) => (
          line.itemId === itemId
            ? { ...line, countedQuantity: Math.floor(countedQuantity) }
            : line
        )),
      }
    }),
  }
}

export function markStocktakeReview(state: InventoryStoreState, sessionId: string): InventoryStoreState {
  const session = state.stocktakes.find((entry) => entry.id === sessionId)
  if (!session) throw new Error('未找到盘点任务。')
  if (session.status === 'posted') throw new Error('盘点已过账。')
  if (session.lines.some((line) => line.countedQuantity == null)) {
    throw new Error('仍有物资未录入实盘数量。')
  }
  return {
    ...state,
    stocktakes: state.stocktakes.map((entry) => (
      entry.id === sessionId
        ? { ...entry, status: 'review', updatedAt: nowIso() }
        : entry
    )),
  }
}

export function postStocktake(state: InventoryStoreState, sessionId: string, operator: string): InventoryStoreState {
  const session = state.stocktakes.find((entry) => entry.id === sessionId)
  if (!session) throw new Error('未找到盘点任务。')
  if (session.status === 'posted') throw new Error('盘点已过账。')
  if (session.lines.some((line) => line.countedQuantity == null)) {
    throw new Error('仍有物资未录入实盘数量。')
  }

  let next = state
  session.lines.forEach((line) => {
    const counted = line.countedQuantity ?? line.systemQuantity
    const delta = counted - line.systemQuantity
    if (delta === 0) return
    next = adjustInventoryQuantity(next, {
      itemId: line.itemId,
      delta,
      reason: `盘点过账 ${session.number}：账面 ${line.systemQuantity} → 实盘 ${counted}`,
      operator: operator.trim() || session.operator,
    })
  })

  return {
    ...next,
    stocktakes: next.stocktakes.map((entry) => (
      entry.id === sessionId
        ? { ...entry, status: 'posted', postedAt: nowIso(), updatedAt: nowIso() }
        : entry
    )),
  }
}

export function buildReplenishmentSuggestions(state: InventoryStoreState): ReplenishmentSuggestion[] {
  return state.items
    .filter((item) => item.status === 'out' || item.status === 'low' || availableQuantity(item) <= item.reorderPoint)
    .map((item) => {
      const available = availableQuantity(item)
      const target = Math.max(item.reorderPoint * 2, item.reorderPoint + 2)
      const suggestedQty = Math.max(1, target - item.quantity)
      const urgency = item.status === 'out' || available === 0
        ? 'critical' as const
        : item.status === 'low' || available <= Math.ceil(item.reorderPoint / 2)
          ? 'high' as const
          : 'medium' as const
      const unitCost = estimateUnitCost(item.category)
      return {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        location: item.location,
        unit: item.unit,
        quantity: item.quantity,
        available,
        reorderPoint: item.reorderPoint,
        suggestedQty,
        estimatedCost: suggestedQty * unitCost,
        urgency,
        reason: item.status === 'out'
          ? '缺货，建议按双倍警戒线补货'
          : `可用 ${available}${item.unit} ≤ 警戒线 ${item.reorderPoint}${item.unit}`,
      }
    })
    .sort((left, right) => {
      const rank = { critical: 0, high: 1, medium: 2 }
      return rank[left.urgency] - rank[right.urgency] || right.suggestedQty - left.suggestedQty
    })
}

export function summarizeInventoryValuation(state: InventoryStoreState) {
  const byCategory = new Map<string, { quantity: number; value: number }>()
  let totalValue = 0
  let totalQuantity = 0
  state.items.forEach((item) => {
    const unitCost = estimateUnitCost(item.category)
    const value = item.quantity * unitCost
    totalValue += value
    totalQuantity += item.quantity
    const current = byCategory.get(item.category) ?? { quantity: 0, value: 0 }
    current.quantity += item.quantity
    current.value += value
    byCategory.set(item.category, current)
  })
  return {
    totalValue,
    totalQuantity,
    categories: [...byCategory.entries()].map(([category, row]) => ({
      id: category,
      label: category,
      value: row.value,
      quantity: row.quantity,
      meta: `${row.quantity} 件`,
    })).sort((left, right) => right.value - left.value),
  }
}

export function findItemBySku(state: InventoryStoreState, skuOrCode: string) {
  const normalized = skuOrCode.trim().toLocaleLowerCase()
  if (!normalized) return null
  return state.items.find((item) => (
    item.sku.toLocaleLowerCase() === normalized
    || item.id.toLocaleLowerCase() === normalized
    || item.name.toLocaleLowerCase() === normalized
  )) ?? null
}
