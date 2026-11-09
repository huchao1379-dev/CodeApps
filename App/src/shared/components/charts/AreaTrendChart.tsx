import { useId, useMemo, useState } from 'react'
import type { ChartOverlaySeries, ChartSeriesPoint } from './charts.types'

export interface AreaTrendChartProps {
  points: ChartSeriesPoint[]
  primaryLabel?: string
  secondaryLabel?: string
  overlaySeries?: ChartOverlaySeries[]
  height?: number
  emptyLabel?: string
  denseLabels?: boolean
  onPointActivate?: (point: ChartSeriesPoint) => void
}

interface HoverState {
  point: ChartSeriesPoint
  x: number
  y: number
}

function buildSmoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return ''
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`
  let path = `M ${coords[0].x} ${coords[0].y}`
  for (let index = 0; index < coords.length - 1; index += 1) {
    const current = coords[index]
    const next = coords[index + 1]
    const midX = (current.x + next.x) / 2
    path += ` C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`
  }
  return path
}

function shouldShowLabel(index: number, total: number, denseLabels: boolean): boolean {
  if (total <= 8) return true
  if (index === 0 || index === total - 1) return true
  if (denseLabels || total <= 14) return index % 2 === 0
  if (total <= 24) return index % 3 === 0
  return index % 5 === 0 || index === Math.floor(total / 2)
}

export function AreaTrendChart({
  points,
  primaryLabel = '新建',
  secondaryLabel = '关闭',
  overlaySeries = [],
  height = 168,
  emptyLabel = '暂无趋势数据',
  denseLabels = false,
  onPointActivate,
}: AreaTrendChartProps) {
  const gradientId = useId().replace(/:/g, '')
  const [hover, setHover] = useState<HoverState | null>(null)
  const width = 640
  const padding = { top: 14, right: 12, bottom: 26, left: 32 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom

  const maxValue = Math.max(
    1,
    ...points.map((point) => Math.max(
      point.value,
      point.secondaryValue ?? 0,
      ...overlaySeries.map((series) => point.overlays?.[series.id] ?? 0),
    )),
  )
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio))

  const coords = useMemo(() => points.map((point, index) => {
    const x = padding.left + (points.length <= 1 ? innerWidth / 2 : index / (points.length - 1) * innerWidth)
    const primaryY = padding.top + innerHeight - point.value / maxValue * innerHeight
    const secondaryY = padding.top + innerHeight - (point.secondaryValue ?? 0) / maxValue * innerHeight
    const overlayYs = Object.fromEntries(overlaySeries.map((series) => [
      series.id,
      padding.top + innerHeight - (point.overlays?.[series.id] ?? 0) / maxValue * innerHeight,
    ]))
    return { point, x, primaryY, secondaryY, overlayYs, index }
  }), [points, innerHeight, innerWidth, maxValue, overlaySeries])

  const primaryLine = buildSmoothPath(coords.map((item) => ({ x: item.x, y: item.primaryY })))
  const secondaryLine = buildSmoothPath(coords.map((item) => ({ x: item.x, y: item.secondaryY })))
  const overlayPaths = overlaySeries.map((series) => ({
    series,
    path: buildSmoothPath(coords.map((item) => ({ x: item.x, y: item.overlayYs[series.id] ?? (padding.top + innerHeight) }))),
  }))
  const primaryArea = coords.length
    ? `${primaryLine} L ${coords[coords.length - 1].x} ${padding.top + innerHeight} L ${coords[0].x} ${padding.top + innerHeight} Z`
    : ''

  if (points.length === 0) return <div className="ui-chart-empty">{emptyLabel}</div>

  return <div className="ui-chart" onMouseLeave={() => setHover(null)}>
    <svg className="ui-chart-svg ui-chart-svg-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="工单处理趋势图" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`area-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7b6fd0" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#7b6fd0" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {yTicks.map((tick) => {
        const y = padding.top + innerHeight - tick / maxValue * innerHeight
        return <g key={tick}>
          <line className="ui-chart-grid-line" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
          <text className="ui-chart-axis-label" x={padding.left - 8} y={y + 3} textAnchor="end">{tick}</text>
        </g>
      })}

      {primaryArea && <path d={primaryArea} fill={`url(#area-fill-${gradientId})`} />}
      {secondaryLine && <path d={secondaryLine} fill="none" stroke="#e0a24a" strokeWidth="2.4" strokeLinecap="round" />}
      {primaryLine && <path d={primaryLine} fill="none" stroke="#5f52b8" strokeWidth="2.4" strokeLinecap="round" />}
      {overlayPaths.map(({ series, path }) => path
        ? <path key={series.id} d={path} fill="none" stroke={series.color} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="5 4" />
        : null)}

      {coords.map(({ point, x, primaryY, secondaryY, overlayYs, index }) => {
        const overlayTotal = overlaySeries.reduce((sum, series) => sum + (point.overlays?.[series.id] ?? 0), 0)
        const interactive = point.value > 0 || (point.secondaryValue ?? 0) > 0 || overlayTotal > 0
        const showLabel = shouldShowLabel(index, points.length, denseLabels)
        const hoverY = Math.min(primaryY, secondaryY, ...Object.values(overlayYs))
        return <g key={point.id}>
          <circle cx={x} cy={primaryY} r={hover?.point.id === point.id ? 4.5 : 3} fill="#5f52b8" />
          <circle cx={x} cy={secondaryY} r={hover?.point.id === point.id ? 4 : 2.5} fill="#e0a24a" />
          {overlaySeries.map((series) => <circle
            key={series.id}
            cx={x}
            cy={overlayYs[series.id]}
            r={hover?.point.id === point.id ? 3.5 : 2.4}
            fill={series.color}
          />)}
          {showLabel && <text className="ui-chart-axis-label" x={x} y={height - 8} textAnchor="middle">{point.label}</text>}
          <rect
            className={interactive ? 'ui-chart-interactive' : undefined}
            x={x - Math.max(8, innerWidth / Math.max(points.length, 1) / 2)}
            y={padding.top}
            width={Math.max(16, innerWidth / Math.max(points.length, 1))}
            height={innerHeight}
            fill="transparent"
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? 'button' : undefined}
            aria-label={`${point.label}：${primaryLabel} ${point.value}，${secondaryLabel} ${point.secondaryValue ?? 0}`}
            onMouseEnter={() => setHover({ point, x: x / width * 100, y: hoverY / height * 100 })}
            onFocus={() => setHover({ point, x: x / width * 100, y: hoverY / height * 100 })}
            onClick={() => interactive && onPointActivate?.(point)}
            onKeyDown={(event) => {
              if (!interactive) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onPointActivate?.(point)
              }
            }}
          />
        </g>
      })}
    </svg>

    <div className="ui-chart-legend" aria-hidden="true">
      <span className="ui-chart-legend-item"><i className="ui-chart-swatch" style={{ color: '#5f52b8' }} />{primaryLabel}</span>
      <span className="ui-chart-legend-item"><i className="ui-chart-swatch" style={{ color: '#e0a24a' }} />{secondaryLabel}</span>
      {overlaySeries.map((series) => <span className="ui-chart-legend-item" key={series.id}>
        <i className="ui-chart-swatch ui-chart-swatch-dashed" style={{ color: series.color }} />{series.label}
      </span>)}
    </div>

    {hover && <div className="ui-chart-tooltip" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>
      <strong>{hover.point.label}</strong>
      <p>{primaryLabel} {hover.point.value} · {secondaryLabel} {hover.point.secondaryValue ?? 0}</p>
      {overlaySeries.length > 0 && <p>
        {overlaySeries.map((series) => `${series.label} ${hover.point.overlays?.[series.id] ?? 0}`).join(' · ')}
      </p>}
      {hover.point.meta && <p>{hover.point.meta}</p>}
    </div>}
  </div>
}
