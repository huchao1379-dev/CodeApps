import type { InventoryMovementType } from '../types/inventory.types'

export type QuantityDirection = 'in' | 'out' | 'transfer' | 'neutral'

export function movementQuantityDirection(
  type: InventoryMovementType,
  quantity: number,
): QuantityDirection {
  if (type === 'transfer') return 'transfer'
  if (type === 'inbound' || type === 'release') return 'in'
  if (type === 'outbound' || type === 'reserve') return 'out'
  if (type === 'adjust') return quantity >= 0 ? 'in' : 'out'
  return 'neutral'
}

export function formatMovementQuantity(type: InventoryMovementType, quantity: number) {
  if (type === 'transfer') return String(Math.abs(quantity))
  if (type === 'adjust') return quantity > 0 ? `+${quantity}` : String(quantity)
  if (type === 'inbound' || type === 'release') return `+${Math.abs(quantity)}`
  return `−${Math.abs(quantity)}`
}

function DirectionIcon({ direction }: { direction: QuantityDirection }) {
  if (direction === 'in') {
    return <svg viewBox="0 0 16 16" aria-hidden="true" className="inventory-qty-icon">
      <path d="M8 2.5 3.5 7.2h2.8V13.5h3.4V7.2H12.5L8 2.5Z" fill="currentColor" />
    </svg>
  }
  if (direction === 'out') {
    return <svg viewBox="0 0 16 16" aria-hidden="true" className="inventory-qty-icon">
      <path d="M8 13.5 12.5 8.8H9.7V2.5H6.3v6.3H3.5L8 13.5Z" fill="currentColor" />
    </svg>
  }
  if (direction === 'transfer') {
    return <svg viewBox="0 0 16 16" aria-hidden="true" className="inventory-qty-icon">
      <path d="M3 5.2h7.2l-1.5-1.5.9-.9L13.2 5.7 9.6 9.3l-.9-.9 1.5-1.5H3V5.2Zm10 5.6H5.8l1.5 1.5-.9.9L2.8 10.3 6.4 6.7l.9.9-1.5 1.5H13v1.7Z" fill="currentColor" />
    </svg>
  }
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="inventory-qty-icon">
    <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor" />
  </svg>
}

export function MovementQuantityBadge({
  type,
  quantity,
  unit,
}: {
  type: InventoryMovementType
  quantity: number
  unit?: string
}) {
  const direction = movementQuantityDirection(type, quantity)
  return <span className={`inventory-qty inventory-qty-${direction}`} title={formatMovementQuantity(type, quantity)}>
    <DirectionIcon direction={direction} />
    <strong>{formatMovementQuantity(type, quantity)}</strong>
    {unit ? <small>{unit}</small> : null}
  </span>
}

export function StockQuantityCell({
  quantity,
  available,
  reserved,
  reorderPoint,
  unit,
}: {
  quantity: number
  available: number
  reserved: number
  reorderPoint: number
  unit?: string
}) {
  const tone = quantity <= 0 ? 'out' : quantity <= reorderPoint ? 'low' : reserved > 0 ? 'reserved' : 'ok'
  return <div className={`inventory-stock-qty inventory-stock-qty-${tone}`}>
    <div className="inventory-stock-qty-main">
      <span className="inventory-stock-qty-icon" aria-hidden="true">▣</span>
      <strong>{quantity}</strong>
      {unit ? <small>{unit}</small> : null}
    </div>
    <small className="inventory-stock-qty-meta">可用 {available} · 预留 {reserved}</small>
  </div>
}

export function LocationRoute({
  from,
  to,
}: {
  from: string | null
  to: string | null
}) {
  return <div className="inventory-route" title={`${from ?? '—'} → ${to ?? '—'}`}>
    <span className={`inventory-route-chip ${from ? '' : 'is-empty'}`}>{from ?? '外部'}</span>
    <span className="inventory-route-arrow" aria-hidden="true">→</span>
    <span className={`inventory-route-chip ${to ? '' : 'is-empty'}`}>{to ?? '外部'}</span>
  </div>
}
