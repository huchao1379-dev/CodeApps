import { useEffect, useRef } from 'react'
import { Pagination } from '../../data-interaction/Pagination'
import { EmptyState } from '../../feedback/EmptyState'
import { ErrorState } from '../../feedback/ErrorState'
import { LoadingState } from '../../feedback/LoadingState'
import type { DataTableProps, SortState, TableColumn } from './DataTable.types'

function getValue<T>(row: T, key: keyof T | string): unknown {
  return (row as unknown as Record<string, unknown>)[String(key)]
}

function toggleSort(current: SortState[] | undefined, field: string): SortState[] {
  const active = current?.find((item) => item.field === field)
  return [{ field, direction: active?.direction === 'asc' ? 'desc' : 'asc' }]
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  ariaLabel = '数据表格',
  loading = false,
  loadingLabel,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  selectedRowKeys,
  onSelectionChange,
  onRowClick,
  sort,
  onSortChange,
  pagination,
  hasNextPage,
  onPaginationChange,
}: DataTableProps<T>) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const rowKeys = data.map(rowKey)
  const selected = selectedRowKeys ?? []
  const selectedOnPage = rowKeys.filter((key) => selected.includes(key))
  const allSelected = rowKeys.length > 0 && selectedOnPage.length === rowKeys.length
  const someSelected = selectedOnPage.length > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  if (loading && data.length === 0) return <LoadingState label={loadingLabel} />
  if (!loading && error && data.length === 0) return <ErrorState description={error} onRetry={onRetry} />
  if (!loading && data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />

  const updateSelection = (key: string, checked: boolean) => {
    if (!onSelectionChange) return
    const next = checked ? [...new Set([...selected, key])] : selected.filter((item) => item !== key)
    onSelectionChange(next)
  }

  const updatePageSelection = (checked: boolean) => {
    if (!onSelectionChange) return
    const keys = new Set(selected)
    rowKeys.forEach((key) => checked ? keys.add(key) : keys.delete(key))
    onSelectionChange([...keys])
  }

  const renderHeader = (column: TableColumn<T>) => {
    const currentSort = sort?.find((item) => item.field === String(column.key))
    const title = column.sortable && onSortChange
      ? <button className="ui-table-sort" type="button" onClick={() => onSortChange(toggleSort(sort, String(column.key)))}>
        {column.title}<span aria-hidden="true">{currentSort ? currentSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
      </button>
      : column.title
    return <th key={String(column.key)} scope="col" style={{ width: column.width, textAlign: column.align ?? 'left' }}
      aria-sort={currentSort ? currentSort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>{title}</th>
  }

  return <div className="ui-data-table-wrap" aria-busy={loading}>
    {loading && <div className="ui-table-loading-bar"><span className="ui-spinner ui-spinner-small" aria-hidden="true" />{loadingLabel ?? '正在更新…'}</div>}
    {!loading && error && data.length > 0 && <ErrorState title="刷新失败，仍显示上次读取的数据" description={error} onRetry={onRetry} />}
    <div className="ui-data-table-scroll">
      <table className="ui-data-table" aria-label={ariaLabel}>
        <thead><tr>
          {onSelectionChange && <th className="ui-table-check-cell" scope="col"><input ref={selectAllRef} className="ui-table-checkbox" type="checkbox"
            aria-label="选择当前页全部记录" checked={allSelected} onChange={(event) => updatePageSelection(event.target.checked)} /></th>}
          {columns.map(renderHeader)}
        </tr></thead>
        <tbody>{data.map((row) => {
          const key = rowKey(row)
          const isSelected = selected.includes(key)
          return <tr key={key} tabIndex={onRowClick ? 0 : undefined} data-clickable={onRowClick ? 'true' : undefined} data-selected={isSelected || undefined}
            aria-label={onRowClick ? `打开记录 ${key}` : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onRowClick(row)
              }
            } : undefined}>
            {onSelectionChange && <td className="ui-table-check-cell" onClick={(event) => event.stopPropagation()}>
              <input className="ui-table-checkbox" type="checkbox" aria-label={`选择记录 ${key}`} checked={isSelected}
                onChange={(event) => updateSelection(key, event.target.checked)} />
            </td>}
            {columns.map((column) => {
              const value = getValue(row, column.key)
              return <td key={String(column.key)} style={{ textAlign: column.align ?? 'left' }}>
                {column.render ? column.render(value, row) : value === null || value === undefined || value === '' ? '—' : String(value)}
              </td>
            })}
          </tr>
        })}</tbody>
      </table>
    </div>
    {pagination && onPaginationChange && <div className="ui-table-pagination"><Pagination page={pagination.page} pageSize={pagination.pageSize} total={pagination.total}
      hasNextPage={hasNextPage} loading={loading} onPageChange={(page) => onPaginationChange({ ...pagination, page })}
      onPageSizeChange={(pageSize) => onPaginationChange({ ...pagination, page: 1, pageSize })} /></div>}
  </div>
}
