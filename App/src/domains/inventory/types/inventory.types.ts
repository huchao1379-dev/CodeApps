export type InventoryStockStatus = 'in-stock' | 'low' | 'out' | 'reserved'

export type InventoryMovementType =
  | 'inbound'
  | 'outbound'
  | 'transfer'
  | 'adjust'
  | 'reserve'
  | 'release'

export interface InventoryItem {
  id: string
  sku: string
  name: string
  category: string
  location: string
  quantity: number
  reservedQuantity: number
  reorderPoint: number
  status: InventoryStockStatus
  owner: string
  unit: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface InventoryMovement {
  id: string
  number: string
  type: InventoryMovementType
  itemId: string
  sku: string
  itemName: string
  quantity: number
  fromLocation: string | null
  toLocation: string | null
  operator: string
  reason: string
  relatedWorkOrder: string | null
  occurredAt: string
}

export interface InventoryLocation {
  id: string
  code: string
  name: string
  zone: string
  capacity: number
  manager: string
  isActive: boolean
}

export interface InventoryLocationSummary extends InventoryLocation {
  skus: number
  quantity: number
  reserved: number
  available: number
  lowOrOut: number
  utilization: number
}

export interface InventoryItemInput {
  sku: string
  name: string
  category: string
  location: string
  quantity: number
  reorderPoint: number
  owner: string
  unit: string
  notes: string
}

export interface InventoryAdjustInput {
  itemId: string
  delta: number
  reason: string
  operator: string
}

export interface InventoryIssueInput {
  itemId: string
  quantity: number
  reason: string
  operator: string
  relatedWorkOrder?: string
}

export interface InventoryReceiveInput {
  itemId: string
  quantity: number
  reason: string
  operator: string
}

export interface InventoryTransferInput {
  itemId: string
  quantity: number
  toLocation: string
  reason: string
  operator: string
}

export interface InventoryReserveInput {
  itemId: string
  quantity: number
  reason: string
  operator: string
}

export type InventoryBatchStatus = 'active' | 'expiring' | 'expired' | 'depleted'

export interface InventoryBatch {
  id: string
  lotNumber: string
  itemId: string
  sku: string
  itemName: string
  location: string
  quantity: number
  receivedAt: string
  expiresAt: string | null
  supplier: string
  status: InventoryBatchStatus
}

export type StocktakeStatus = 'draft' | 'counting' | 'review' | 'posted'

export interface StocktakeLine {
  itemId: string
  sku: string
  itemName: string
  systemQuantity: number
  countedQuantity: number | null
  unit: string
}

export interface StocktakeSession {
  id: string
  number: string
  location: string
  status: StocktakeStatus
  operator: string
  startedAt: string
  updatedAt: string
  postedAt: string | null
  lines: StocktakeLine[]
  notes: string
}

export type InventoryAlertKind = 'out' | 'low' | 'expiring' | 'expired' | 'overstock'

export interface InventoryAlert {
  id: string
  kind: InventoryAlertKind
  severity: 'critical' | 'high' | 'medium'
  title: string
  description: string
  itemId: string | null
  batchId: string | null
  location: string | null
  occurredAt: string
}

export const INVENTORY_STATUS_LABELS: Record<InventoryStockStatus, string> = {
  'in-stock': '充足',
  low: '偏低',
  out: '缺货',
  reserved: '预留',
}

export const INVENTORY_MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  inbound: '入库',
  outbound: '领用',
  transfer: '调拨',
  adjust: '调整',
  reserve: '预留',
  release: '释放预留',
}

export const INVENTORY_CATEGORIES = [
  '终端设备',
  '外设',
  '网络设备',
  '安全配件',
  '会议设备',
  '备件',
] as const

export const INVENTORY_OWNERS = [
  '终端支持',
  '基础架构',
  '服务台',
  '会议支持',
  '安全运营',
] as const

export const INVENTORY_BATCH_STATUS_LABELS: Record<InventoryBatchStatus, string> = {
  active: '有效',
  expiring: '临期',
  expired: '过期',
  depleted: '已耗尽',
}

export const STOCKTAKE_STATUS_LABELS: Record<StocktakeStatus, string> = {
  draft: '草稿',
  counting: '盘点中',
  review: '待复核',
  posted: '已过账',
}

export const INVENTORY_ALERT_LABELS: Record<InventoryAlertKind, string> = {
  out: '缺货',
  low: '低于警戒线',
  expiring: '批次临期',
  expired: '批次过期',
  overstock: '库位超容',
}

export function deriveBatchStatus(quantity: number, expiresAt: string | null, now = Date.now()): InventoryBatchStatus {
  if (quantity <= 0) return 'depleted'
  if (!expiresAt) return 'active'
  const expires = new Date(expiresAt).getTime()
  if (expires < now) return 'expired'
  const daysLeft = (expires - now) / (24 * 60 * 60 * 1000)
  if (daysLeft <= 30) return 'expiring'
  return 'active'
}

export function deriveInventoryStatus(
  quantity: number,
  reservedQuantity: number,
  reorderPoint: number,
): InventoryStockStatus {
  if (quantity <= 0) return 'out'
  if (reservedQuantity > 0) return 'reserved'
  if (quantity <= reorderPoint) return 'low'
  return 'in-stock'
}

export function availableQuantity(item: Pick<InventoryItem, 'quantity' | 'reservedQuantity'>) {
  return Math.max(0, item.quantity - item.reservedQuantity)
}

export type ReplenishmentUrgency = 'critical' | 'high' | 'medium'

export interface ReplenishmentSuggestion {
  itemId: string
  sku: string
  name: string
  category: string
  location: string
  unit: string
  quantity: number
  available: number
  reorderPoint: number
  suggestedQty: number
  estimatedCost: number
  urgency: ReplenishmentUrgency
  reason: string
}

/** Mock unit costs by category — inventory valuation (not used in work-order domain). */
export const INVENTORY_CATEGORY_UNIT_COST: Record<string, number> = {
  终端设备: 3200,
  外设: 280,
  网络设备: 1800,
  安全配件: 420,
  会议设备: 2600,
  备件: 360,
}

export function estimateUnitCost(category: string) {
  return INVENTORY_CATEGORY_UNIT_COST[category] ?? 200
}

export const REPLENISHMENT_URGENCY_LABELS: Record<ReplenishmentUrgency, string> = {
  critical: '紧急',
  high: '优先',
  medium: '常规',
}
