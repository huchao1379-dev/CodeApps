export interface SearchInputProps {
  value: string
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  loading?: boolean
  debounceMs?: number
  onChange: (value: string) => void
  onSearch?: (value: string) => void
  onClear?: () => void
}
