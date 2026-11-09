import { useEffect, useId, useState, type FormEvent } from 'react'
import type { PaginationProps } from './Pagination.types'

export function Pagination({ page, pageSize, total, hasNextPage, loading = false, pageSizeOptions = [10, 20, 50], onPageChange, onPageSizeChange }: PaginationProps) {
  const id = useId()
  const [jumpValue, setJumpValue] = useState(String(page))
  useEffect(() => setJumpValue(String(page)), [page])
  const pageCount = total === undefined ? undefined : Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const canGoNext = !loading && (pageCount === undefined ? Boolean(hasNextPage) : page < pageCount)
  const goToPage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextPage = Number(jumpValue)
    if (!Number.isFinite(nextPage)) return
    const boundedPage = Math.max(1, pageCount === undefined ? Math.floor(nextPage) : Math.min(pageCount, Math.floor(nextPage)))
    if (boundedPage >= 1) onPageChange(boundedPage)
  }

  return <nav className="ui-pagination" aria-label="分页">
    {total !== undefined && <span className="ui-pagination-label">共 {total} 条</span>}
    <label className="ui-pagination-label">每页
      <select value={pageSize} disabled={loading} onChange={(event) => onPageSizeChange(Math.max(1, Number(event.target.value)))}>
        {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      条
    </label>
    <button className="ui-page-button" type="button" aria-label="上一页" disabled={loading || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>‹</button>
    <form onSubmit={goToPage}>
      <label className="ui-visually-hidden" htmlFor={`ui-page-jump-${id}`}>跳转到页码</label>
      <input id={`ui-page-jump-${id}`} type="number" min={1} max={pageCount} value={jumpValue} disabled={loading}
        onChange={(event) => setJumpValue(event.target.value)} />
    </form>
    <span className="ui-pagination-label">/ {pageCount ?? '…'}</span>
    <button className="ui-page-button" type="button" aria-label="下一页" disabled={!canGoNext} onClick={() => onPageChange(page + 1)}>›</button>
  </nav>
}
