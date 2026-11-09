export type InventoryStockStatus = 'in-stock' | 'low' | 'out' | 'reserved'

export interface InventoryItem {
  id: string
  sku: string
  name: string
  category: string
  location: string
  quantity: number
  reorderPoint: number
  status: InventoryStockStatus
  owner: string
  updatedAt: string
}

export const INVENTORY_STATUS_LABELS: Record<InventoryStockStatus, string> = {
  'in-stock': '充足',
  low: '偏低',
  out: '缺货',
  reserved: '预留',
}
