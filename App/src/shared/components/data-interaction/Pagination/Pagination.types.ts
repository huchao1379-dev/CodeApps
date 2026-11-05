export interface TablePagination {
  page: number
  pageSize: number
  total?: number
}

export interface PaginationProps {
  page: number
  pageSize: number
  total?: number
  hasNextPage?: boolean
  loading?: boolean
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}
