import { useMemo, useState } from 'react'
import type { ChartCategoryItem } from './charts.types'

const DEFAULT_COLORS = ['#7b6fd0', '#5b9bd5', '#4e9d7c', '#e0a24a', '#c84c3d', '#8b95a7', '#9b7bb8']

export interface DonutChartProps {
  items: ChartCategoryItem[]
  centerLabel?: string
  emptyLabel?: string
  onItemActivate?: (item: ChartCategoryItem) => void
}

interface SliceGeometry {
  item: ChartCategoryItem
  color: string
  path: string
  percent: number
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }
}

function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const largeArc = end - start > 180 ? 1 : 0
  const outerStart = polar(cx, cy, outer, end)
  const outerEnd = polar(cx, cy, outer, start)
  const innerStart = polar(cx, cy, inner, start)
  const innerEnd = polar(cx, cy, inner, end)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ')
}

export function DonutChart({
  items,
  centerLabel = '总计',
  emptyLabel = '暂无分布数据',
  onItemActivate,
}: DonutChartProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const size = 320
  const cx = size / 2
  const cy = size / 2
  const outer = 128
  const inner = 78

  const slices = useMemo(() => {
    if (total <= 0) return [] as SliceGeometry[]
    let angle = 0
    return items.filter((item) => item.value > 0).map((item, index) => {
      const sweep = item.value / total * 360
      const start = angle
      const end = angle + Math.max(sweep, 0.8)
      angle += sweep
      return {
        item,
        color: item.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        path: arcPath(cx, cy, outer, inner, start, end),
        percent: Math.round(item.value / total * 100),
      }
    })
  }, [items, total])

  if (total <= 0) return <div className="ui-chart-empty">{emptyLabel}</div>

  const active = slices.find((slice) => slice.item.id === activeId) ?? null

  return <div className="ui-chart ui-chart-donut" onMouseLeave={() => setActiveId(null)}>
    <svg className="ui-chart-svg ui-chart-svg-donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="状态分布环形图" preserveAspectRatio="xMidYMid meet">
      {slices.map((slice) => <path
        key={slice.item.id}
        className="ui-chart-interactive ui-chart-hit"
        d={slice.path}
        fill={slice.color}
        opacity={activeId && activeId !== slice.item.id ? 0.42 : 1}
        stroke={activeId === slice.item.id ? '#fff' : 'transparent'}
        strokeWidth={activeId === slice.item.id ? 2 : 0}
        tabIndex={0}
        role="button"
        aria-label={`${slice.item.label} ${slice.item.value}（${slice.percent}%）`}
        onMouseEnter={() => setActiveId(slice.item.id)}
        onFocus={() => setActiveId(slice.item.id)}
        onClick={() => onItemActivate?.(slice.item)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onItemActivate?.(slice.item)
          }
        }}
      />)}
      <text className="ui-donut-center" x={cx} y={cy - 2}>{total}</text>
      <text className="ui-donut-center-sub" x={cx} y={cy + 16}>{centerLabel}</text>
    </svg>

    <div className="ui-chart-legend">
      {slices.map((slice) => <button
        key={slice.item.id}
        type="button"
        className="ui-chart-legend-item ui-chart-interactive"
        style={{ color: slice.color, border: 0, background: 'transparent', padding: 0, font: 'inherit' }}
        onMouseEnter={() => setActiveId(slice.item.id)}
        onClick={() => onItemActivate?.(slice.item)}
      >
        <i className="ui-chart-swatch" style={{ color: slice.color }} />
        <span style={{ color: 'var(--color-text-secondary)' }}>{slice.item.label} {slice.item.value}</span>
      </button>)}
    </div>

    {active && <div className="ui-chart-tooltip" style={{ left: '50%', top: '42%' }}>
      <strong>{active.item.label}</strong>
      <p>{active.item.value} 张 · 占比 {active.percent}%</p>
      {active.item.meta && <p>{active.item.meta}</p>}
    </div>}
  </div>
}
