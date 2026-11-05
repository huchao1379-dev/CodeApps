import type { ReactNode } from 'react'
import type { TablePagination } from '../../data-interaction/Pagination/Pagination.types'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  field: string
  direction: SortDirection
}

export interface TableColumn<T> {
  key: keyof T | string
  title: string
  width?: number | string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  render?: (value: unknown, row: T) => ReactNode
}

export interface DataTableProps<T> {
  data: T[]
  columns: TableColumn<T>[]
  rowKey: (row: T) => string
  ariaLabel?: string
  loading?: boolean
  loadingLabel?: string
  error?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  selectedRowKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  onRowClick?: (row: T) => void
  sort?: SortState[]
  onSortChange?: (sort: SortState[]) => void
  pagination?: TablePagination
  hasNextPage?: boolean
  onPaginationChange?: (pagination: TablePagination) => void
}
