import type { ChartCapacityItem } from './charts.types'

export interface CapacityGaugeChartProps {
  items: ChartCapacityItem[]
  emptyLabel?: string
  onItemActivate?: (item: ChartCapacityItem) => void
}

export function CapacityGaugeChart({
  items,
  emptyLabel = '没有可分析的负载数据',
  onItemActivate,
}: CapacityGaugeChartProps) {
  if (items.length === 0) return <div className="ui-chart-empty">{emptyLabel}</div>

  const fallbackMax = Math.max(1, ...items.map((item) => item.value))

  return <div className="ui-chart">
    <div className="ui-capacity-list" role="list" aria-label="工程师工作负载">
      {items.map((item) => {
        const capacity = item.capacity ?? null
        const denominator = capacity && capacity > 0 ? capacity : fallbackMax
        const ratio = Math.min(1.2, item.value / Math.max(1, denominator))
        const width = `${Math.min(100, ratio * 100)}%`
        const full = capacity != null && item.value >= capacity
        const warn = !full && capacity != null && item.value / capacity >= 0.75
        const markerLeft = capacity != null ? `${Math.min(100, capacity / Math.max(capacity, item.value, 1) * 100)}%` : null
        return <button
          key={item.id}
          type="button"
          className="ui-capacity-row"
          role="listitem"
          disabled={item.value <= 0}
          onClick={() => item.value > 0 && onItemActivate?.(item)}
          aria-label={`${item.label} 负载 ${item.value}${capacity != null ? ` / ${capacity}` : ''}`}
        >
          <span className="ui-capacity-person">
            <strong>{item.label}</strong>
            {item.subtitle && <small>{item.subtitle}</small>}
          </span>
          <span className="ui-capacity-track" aria-hidden="true">
            <i className={`ui-capacity-fill${full ? ' is-full' : warn ? ' is-warn' : ''}`} style={{ width }} />
            {markerLeft && <i className="ui-capacity-marker" style={{ left: markerLeft }} />}
          </span>
          <span className="ui-capacity-value">
            {item.value}<small> / {capacity ?? '∞'}</small>
          </span>
        </button>
      })}
    </div>
  </div>
}
