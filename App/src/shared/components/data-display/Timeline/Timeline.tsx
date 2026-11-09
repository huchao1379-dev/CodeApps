import type { TimelineProps } from './Timeline.types'

export function Timeline({ items, emptyLabel = '暂无记录', ariaLabel = '时间线' }: TimelineProps) {
  if (items.length === 0) {
    return <p className="ui-timeline-empty" role="status">{emptyLabel}</p>
  }

  return <div className="ui-timeline" role="list" aria-label={ariaLabel}>
    {items.map((item) => {
      const tone = item.tone ?? 'default'
      return <article className="ui-timeline-row" role="listitem" key={item.id}>
        <span className={`ui-timeline-dot ui-timeline-dot-${tone}`} aria-hidden="true" />
        <div className="ui-timeline-content">
          <strong>{item.title}</strong>
          {item.description != null && item.description !== '' && <div className="ui-timeline-description">{item.description}</div>}
          {item.meta != null && item.meta !== '' && <div className="ui-timeline-meta">{item.meta}</div>}
          {item.time != null && item.time !== '' && <time className="ui-timeline-time">{item.time}</time>}
        </div>
      </article>
    })}
  </div>
}
