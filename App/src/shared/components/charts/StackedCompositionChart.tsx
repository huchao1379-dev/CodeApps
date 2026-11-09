import { useState } from 'react'
import type { ChartCategoryItem } from './charts.types'

const DEFAULT_COLORS = ['#8aa0b8', '#5b9bd5', '#e0a24a', '#c84c3d']

export interface StackedCompositionChartProps {
  items: ChartCategoryItem[]
  title?: string
  emptyLabel?: string
  onItemActivate?: (item: ChartCategoryItem) => void
}

export function StackedCompositionChart({
  items,
  title = '合计',
  emptyLabel = '暂无优先级数据',
  onItemActivate,
}: StackedCompositionChartProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return <div className="ui-chart-empty">{emptyLabel}</div>

  const colored = items.map((item, index) => ({
    ...item,
    color: item.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    percent: Math.round(item.value / total * 100),
  }))

  return <div className="ui-chart ui-stack-chart" onMouseLeave={() => setActiveId(null)}>
    <div className="ui-stack-total">
      <strong>{total}</strong>
      <span>{title}</span>
    </div>

    <div className="ui-stack-bar" role="img" aria-label="优先级组成条">
      {colored.map((item) => <button
        key={item.id}
        type="button"
        className="ui-stack-segment ui-chart-interactive"
        disabled={item.value <= 0}
        style={{
          flexGrow: Math.max(item.value, 0),
          background: item.color,
          opacity: activeId && activeId !== item.id ? 0.45 : 1,
        }}
        aria-label={`${item.label} ${item.value}（${item.percent}%）`}
        onMouseEnter={() => setActiveId(item.id)}
        onFocus={() => setActiveId(item.id)}
        onClick={() => item.value > 0 && onItemActivate?.(item)}
      />)}
    </div>

    <div className="ui-stack-breakdown">
      {colored.map((item) => <button
        key={item.id}
        type="button"
        className="ui-stack-item"
        disabled={item.value <= 0}
        onMouseEnter={() => setActiveId(item.id)}
        onClick={() => item.value > 0 && onItemActivate?.(item)}
      >
        <i className="ui-chart-swatch" style={{ color: item.color }} />
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <em>{item.percent}%</em>
      </button>)}
    </div>
  </div>
}
