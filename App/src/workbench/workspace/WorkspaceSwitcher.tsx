import { useEffect, useRef, useState } from 'react'
import './WorkspaceSwitcher.css'

export type WorkspaceId = 'it-service' | 'inventory'

export interface WorkspaceOption {
  id: WorkspaceId
  label: string
  shortLabel: string
  description: string
}

export const WORKSPACE_OPTIONS: WorkspaceOption[] = [
  {
    id: 'it-service',
    label: 'IT 服务运营',
    shortLabel: 'IT',
    description: '工单、派发与服务资源',
  },
  {
    id: 'inventory',
    label: '库存管理工作台',
    shortLabel: 'INV',
    description: '台账、出入库与库位',
  },
]

export interface WorkspaceSwitcherProps {
  value: WorkspaceId
  onChange: (workspaceId: WorkspaceId) => void
}

export function WorkspaceSwitcher({ value, onChange }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const current = WORKSPACE_OPTIONS.find((option) => option.id === value) ?? WORKSPACE_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return <div className={`workspace-switcher${open ? ' is-open' : ''}`} ref={rootRef}>
    <button
      className="workspace-switch"
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label="切换工作区"
      onClick={() => setOpen((currentOpen) => !currentOpen)}
    >
      <div className="workspace-avatar">{current.shortLabel}</div>
      <div>
        <span>工作区</span>
        <strong>{current.label}</strong>
      </div>
      <span className="switch-caret" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
    </button>

    {open && <ul className="workspace-switch-menu" role="listbox" aria-label="可选工作区">
      {WORKSPACE_OPTIONS.map((option) => {
        const selected = option.id === value
        return <li key={option.id} role="option" aria-selected={selected}>
          <button
            type="button"
            className={`workspace-switch-option${selected ? ' is-selected' : ''}`}
            onClick={() => {
              onChange(option.id)
              setOpen(false)
            }}
          >
            <span className="workspace-avatar">{option.shortLabel}</span>
            <span className="workspace-switch-copy">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            {selected && <span className="workspace-switch-check" aria-hidden="true">✓</span>}
          </button>
        </li>
      })}
    </ul>}
  </div>
}
