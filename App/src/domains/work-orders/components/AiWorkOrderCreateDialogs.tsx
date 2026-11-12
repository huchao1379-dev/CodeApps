import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { priorityOptions } from '../config/workOrderChoices'
import { useOverlayFocus } from '../../../shared/components/overlays/useOverlayFocus'
import {
  type AiWorkOrderDraft,
  parseWorkOrderDraftFromUtterance,
  toWorkOrderInputFromAiDraft,
} from '../../../integrations/power-automate/aiWorkOrderDraftAdapter'
import type {
  DepartmentOption,
  ServiceCategoryOption,
  WorkOrderInput,
} from '../types/workOrder.types'
import './AiWorkOrderCreateDialogs.css'

function ModalShell({ title, subtitle, onClose, children, wide }: {
  title: string
  subtitle: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const dialogRef = useOverlayFocus<HTMLElement>(true, onClose)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section
      ref={dialogRef}
      tabIndex={-1}
      className={`modal-card${wide ? ' ai-create-modal' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="modal-header">
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" onClick={onClose}>×</button>
      </header>
      {children}
    </section>
  </div>
}

export function CreateWorkOrderChoiceDialog({
  open,
  busy,
  onClose,
  onManual,
  onAi,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onManual: () => void
  onAi: () => void
}) {
  if (!open) return null
  return <ModalShell title="新建工单" subtitle="选择创建方式" onClose={onClose}>
    <div className="modal-content create-choice-grid">
      <button className="create-choice-card" type="button" disabled={busy} onClick={onManual}>
        <strong>手动新建</strong>
        <span>自行填写标题、类别、部门与优先级后创建。</span>
      </button>
      <button className="create-choice-card create-choice-card-ai" type="button" disabled={busy} onClick={onAi}>
        <strong>AI 新建</strong>
        <span>用自然语言描述问题，AI 解析后确认并创建工单。</span>
      </button>
    </div>
    <footer className="modal-footer">
      <button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>取消</button>
    </footer>
  </ModalShell>
}

function isLowConfidence(fields: string[], key: string): boolean {
  const normalized = key.toLocaleLowerCase()
  return fields.some((field) => field.toLocaleLowerCase().includes(normalized))
}

export function AiWorkOrderCreateDialog({
  open,
  departments,
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  departments: DepartmentOption[]
  categories: ServiceCategoryOption[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: WorkOrderInput) => void
}) {
  const [utterance, setUtterance] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [draft, setDraft] = useState<AiWorkOrderDraft | null>(null)
  const activeDepartments = useMemo(() => departments.filter((department) => department.isActive), [departments])
  const activeCategories = useMemo(() => categories.filter((category) => category.isActive), [categories])

  useEffect(() => {
    if (!open) return
    setUtterance('')
    setParsing(false)
    setParseError(null)
    setDraft(null)
  }, [open])

  if (!open) return null

  const lowFields = draft?.lowConfidenceFields ?? []
  const canCreate = Boolean(draft?.workOrderName.trim() && draft.serviceCategoryId && draft.departmentId)

  const runParse = async () => {
    setParsing(true)
    setParseError(null)
    try {
      const nextDraft = await parseWorkOrderDraftFromUtterance(utterance, categories, departments)
      setDraft(nextDraft)
    } catch (caught) {
      setDraft(null)
      setParseError(caught instanceof Error ? caught.message : 'AI 解析失败，请稍后重试。')
    } finally {
      setParsing(false)
    }
  }

  return <ModalShell
    title="AI 新建工单"
    subtitle="描述问题后解析草稿，确认无误再创建"
    onClose={onClose}
    wide
  >
    <div className="modal-content form-stack">
      <label>用户需求<b>*</b>
        <textarea
          rows={4}
          maxLength={500}
          placeholder="例如：财务部 3 楼笔记本蓝屏，需要优先处理"
          value={utterance}
          disabled={busy || parsing}
          onChange={(event) => setUtterance(event.target.value)}
        />
      </label>
      <div className="ai-parse-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={busy || parsing || !utterance.trim()}
          onClick={() => { void runParse() }}
        >{parsing ? '解析中…' : draft ? '重新解析' : '解析需求'}</button>
      </div>

      {parseError && <p className="form-error" role="alert">{parseError}</p>}

      {draft && <>
        <div className="ai-draft-meta">
          <span>置信度：{draft.confidence == null ? '未返回' : `${Math.round(draft.confidence * 100)}%`}</span>
          {draft.rationale && <span>依据：{draft.rationale}</span>}
        </div>

        <label className={isLowConfidence(lowFields, 'workordername') || isLowConfidence(lowFields, 'title') ? 'field-low-confidence' : undefined}>
          工单标题<b>*</b>
          <input
            required
            maxLength={850}
            value={draft.workOrderName}
            disabled={busy || parsing}
            onChange={(event) => setDraft((current) => current ? { ...current, workOrderName: event.target.value } : current)}
          />
        </label>
        <label className={isLowConfidence(lowFields, 'issuedescription') || isLowConfidence(lowFields, 'description') ? 'field-low-confidence' : undefined}>
          问题描述
          <input
            maxLength={100}
            value={draft.issueDescription}
            disabled={busy || parsing}
            onChange={(event) => setDraft((current) => current ? { ...current, issueDescription: event.target.value } : current)}
          />
        </label>
        <div className="form-row">
          <label className={isLowConfidence(lowFields, 'category') ? 'field-low-confidence' : undefined}>
            服务类别<b>*</b>
            <select
              required
              value={draft.serviceCategoryId}
              disabled={busy || parsing}
              onChange={(event) => {
                const category = activeCategories.find((item) => item.id === event.target.value)
                const defaultDepartmentId = activeDepartments.some((item) => item.id === category?.defaultDepartmentId)
                  ? category?.defaultDepartmentId ?? ''
                  : ''
                setDraft((current) => current ? {
                  ...current,
                  serviceCategoryId: event.target.value,
                  categoryName: category?.serviceCategoryName ?? current.categoryName,
                  departmentId: defaultDepartmentId || current.departmentId,
                  ...(category?.defaultPriority ? { priority: category.defaultPriority } : {}),
                } : current)
              }}
            >
              <option value="">选择服务类别</option>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.serviceCategoryName}</option>)}
            </select>
          </label>
          <label className={isLowConfidence(lowFields, 'department') ? 'field-low-confidence' : undefined}>
            负责部门<b>*</b>
            <select
              required
              value={draft.departmentId}
              disabled={busy || parsing}
              onChange={(event) => setDraft((current) => current ? { ...current, departmentId: event.target.value } : current)}
            >
              <option value="">选择负责部门</option>
              {activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.departmentName}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className={isLowConfidence(lowFields, 'priority') ? 'field-low-confidence' : undefined}>
            优先级<b>*</b>
            <select
              required
              value={draft.priority}
              disabled={busy || parsing}
              onChange={(event) => setDraft((current) => current ? {
                ...current,
                priority: Number(event.target.value) as AiWorkOrderDraft['priority'],
              } : current)}
            >
              {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        {!canCreate && <p className="form-error">请补全服务类别和负责部门后再创建。</p>}
      </>}

      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <footer className="modal-footer">
      <button className="button button-quiet" type="button" onClick={onClose} disabled={busy || parsing}>取消</button>
      <button
        className="button button-primary"
        type="button"
        disabled={busy || parsing || !draft || !canCreate}
        onClick={() => {
          if (!draft) return
          onSubmit(toWorkOrderInputFromAiDraft(draft))
        }}
      >{busy ? '创建中…' : '确认创建工单'}</button>
    </footer>
  </ModalShell>
}
