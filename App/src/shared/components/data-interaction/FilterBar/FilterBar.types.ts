export type FilterType = 'text' | 'select' | 'multiSelect' | 'dateRange' | 'datePeriod'

export interface FilterOption {
  label: string
  value: string
}

export interface DateRangeValue {
  from?: string
  to?: string
}

export type DatePeriod = 'all' | 'day' | 'week' | 'month'

export interface DatePeriodValue {
  period: DatePeriod
  anchorDate: string
}

export type FilterValue = string | string[] | DateRangeValue | DatePeriodValue | undefined
export type FilterValues = Record<string, FilterValue>

export interface FilterDefinition {
  key: string
  label: string
  type: FilterType
  placeholder?: string
  options?: FilterOption[]
  fullWidth?: boolean
}

export interface FilterBarProps {
  definitions: FilterDefinition[]
  values: FilterValues
  onChange: (values: FilterValues) => void
  onApply?: () => void
  onReset?: () => void
  resetLabel?: string
  applyLabel?: string
}
