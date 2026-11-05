import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import type { SearchInputProps } from './SearchInput.types'

export function SearchInput({
  value,
  placeholder = '搜索…',
  ariaLabel = '搜索',
  disabled = false,
  loading = false,
  debounceMs = 300,
  onChange,
  onSearch,
  onClear,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (!onSearch) return undefined
    const timer = window.setTimeout(() => onSearch(draft.trim()), Math.max(0, debounceMs))
    return () => window.clearTimeout(timer)
  }, [draft, debounceMs, onSearch])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    setDraft(nextValue)
    onChange(nextValue)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch?.(draft.trim())
  }

  const clear = () => {
    setDraft('')
    onChange('')
    onClear?.()
  }

  return <form className="ui-search-field" role="search" onSubmit={submit}>
    <span className="ui-search-icon" aria-hidden="true">⌕</span>
    <input className="ui-search-input" type="search" value={draft} placeholder={placeholder} aria-label={ariaLabel} disabled={disabled} onChange={handleChange} />
    {loading && <span className="ui-search-loading" role="status" aria-label="搜索中" />}
    {!loading && draft && <button className="ui-search-clear" type="button" aria-label="清除搜索" disabled={disabled} onClick={clear}>×</button>}
    <button className="ui-visually-hidden" type="submit" disabled={disabled}>搜索</button>
  </form>
}
