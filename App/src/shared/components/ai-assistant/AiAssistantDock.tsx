import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  getDeepSeekConfigSnapshot,
  getDeepSeekModel,
  hasDeepSeekApiKey,
  setDeepSeekRuntimeConfig,
} from '../../../integrations/deepseek/deepseekConfig'
import {
  askDeepSeekAssistant,
  stripAssistantAttribution,
} from '../../../integrations/deepseek/deepseekAssistantService'
import {
  toWorkOrderInputFromAiDraft,
  type AiWorkOrderDraft,
} from '../../../integrations/power-automate/aiWorkOrderDraftAdapter'
import { priorityOptions } from '../../../domains/work-orders/config/workOrderChoices'
import type {
  DepartmentOption,
  EmployeeOption,
  ServiceCategoryOption,
  WorkOrder,
  WorkOrderInput,
} from '../../../domains/work-orders/types/workOrder.types'
import type { DeepSeekChatMessage } from '../../../integrations/deepseek/deepseekClient'
import './AiAssistantDock.css'

type ChatItem = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  source?: 'local-data' | 'deepseek'
}

type DockPosition = {
  left: number
  top: number
}

type AiAssistantDockProps = {
  departments: DepartmentOption[]
  categories: ServiceCategoryOption[]
  workOrders: WorkOrder[]
  employees: EmployeeOption[]
  canCreate: boolean
  createBusy?: boolean
  onCreateWorkOrder: (input: WorkOrderInput) => Promise<void> | void
}

const POSITION_STORAGE_KEY = 'opsdesk.aiAssistant.position'
const FAB_SIZE = 56
const PANEL_WIDTH = 380
const PANEL_GAP = 12

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultPosition(): DockPosition {
  if (typeof window === 'undefined') return { left: 24, top: 24 }
  return {
    left: Math.max(12, window.innerWidth - FAB_SIZE - 24),
    top: Math.max(12, window.innerHeight - FAB_SIZE - 24),
  }
}

function readStoredPosition(): DockPosition | null {
  try {
    const raw = sessionStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DockPosition
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function clampPosition(position: DockPosition): DockPosition {
  if (typeof window === 'undefined') return position
  const maxLeft = Math.max(12, window.innerWidth - FAB_SIZE - 12)
  const maxTop = Math.max(12, window.innerHeight - FAB_SIZE - 12)
  return {
    left: Math.min(Math.max(12, position.left), maxLeft),
    top: Math.min(Math.max(12, position.top), maxTop),
  }
}

function panelStyleFromFab(position: DockPosition): CSSProperties {
  if (typeof window === 'undefined') {
    return { left: position.left, bottom: FAB_SIZE + PANEL_GAP, width: PANEL_WIDTH }
  }
  const width = Math.min(PANEL_WIDTH, window.innerWidth - 24)
  const preferredLeft = position.left + FAB_SIZE - width
  const left = Math.min(Math.max(12, preferredLeft), Math.max(12, window.innerWidth - width - 12))
  const spaceAbove = position.top - 12
  const spaceBelow = window.innerHeight - (position.top + FAB_SIZE) - 12
  const preferAbove = spaceAbove >= 280 || spaceAbove >= spaceBelow
  if (preferAbove) {
    const height = Math.min(620, Math.max(320, spaceAbove - PANEL_GAP))
    return {
      left,
      top: Math.max(12, position.top - PANEL_GAP - height),
      width,
      height,
    }
  }
  const height = Math.min(620, Math.max(320, spaceBelow - PANEL_GAP))
  return {
    left,
    top: position.top + FAB_SIZE + PANEL_GAP,
    width,
    height,
  }
}

export function AiAssistantDock({
  departments,
  categories,
  workOrders,
  employees,
  canCreate,
  createBusy = false,
  onCreateWorkOrder,
}: AiAssistantDockProps) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [forceCreate, setForceCreate] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<AiWorkOrderDraft | null>(null)
  const [messages, setMessages] = useState<ChatItem[]>([{
    id: 'welcome',
    role: 'system',
    content: '我是 DeepSeek 助手：可聊日常问题，也可查询工单/空闲员工；需要建单时切换「建单模式」。按住标题栏或 AI 按钮可拖动。',
  }])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState(DEEPSEEK_DEFAULT_BASE_URL)
  const [modelInput, setModelInput] = useState(DEEPSEEK_DEFAULT_MODEL)
  const [keyConfigured, setKeyConfigured] = useState(hasDeepSeekApiKey())
  const [maskedKey, setMaskedKey] = useState(getDeepSeekConfigSnapshot().apiKeyMasked)
  const [modelLabel, setModelLabel] = useState(getDeepSeekModel())
  const [position, setPosition] = useState<DockPosition>(() => clampPosition(readStoredPosition() ?? defaultPosition()))
  const [dragging, setDragging] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const positionRef = useRef(position)
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    moved: boolean
    originLeft: number
    originTop: number
    toggleOnClick: boolean
  } | null>(null)

  const activeDepartments = useMemo(() => departments.filter((item) => item.isActive), [departments])
  const activeCategories = useMemo(() => categories.filter((item) => item.isActive), [categories])
  const panelStyle = useMemo(() => panelStyleFromFab(position), [position])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    if (!open) return
    const snapshot = getDeepSeekConfigSnapshot()
    setKeyConfigured(snapshot.apiKeyConfigured)
    setMaskedKey(snapshot.apiKeyMasked)
    setBaseUrlInput(snapshot.baseUrl)
    setModelInput(snapshot.model)
    setModelLabel(snapshot.model)
  }, [open, settingsOpen])

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [open, messages, draft, error, busy])

  useEffect(() => {
    const onResize = () => setPosition((current) => clampPosition(current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      const nextLeft = event.clientX - drag.offsetX
      const nextTop = event.clientY - drag.offsetY
      if (Math.abs(nextLeft - drag.originLeft) > 4 || Math.abs(nextTop - drag.originTop) > 4) {
        drag.moved = true
      }
      const clamped = clampPosition({ left: nextLeft, top: nextTop })
      positionRef.current = clamped
      setPosition(clamped)
    }

    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const shouldToggle = drag.toggleOnClick && !drag.moved
      dragRef.current = null
      setDragging(false)
      try {
        sessionStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positionRef.current))
      } catch {
        // ignore
      }
      if (shouldToggle) setOpen((value) => !value)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging])

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  const canSubmitDraft = Boolean(
    draft
    && draft.workOrderName.trim()
    && draft.serviceCategoryId
    && draft.departmentId
    && canCreate
    && !createBusy
    && !busy,
  )

  const refreshKeyState = () => {
    const snapshot = getDeepSeekConfigSnapshot()
    setKeyConfigured(snapshot.apiKeyConfigured)
    setMaskedKey(snapshot.apiKeyMasked)
    setModelLabel(snapshot.model)
  }

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, toggleOnClick = false) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    // Allow dragging the FAB itself; only block nested controls (settings/close).
    const blocked = target.closest('button, input, textarea, select, a')
    if (blocked && blocked !== event.currentTarget) return
    event.preventDefault()
    event.stopPropagation()
    const current = positionRef.current
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - current.left,
      offsetY: event.clientY - current.top,
      moved: false,
      originLeft: current.left,
      originTop: current.top,
      toggleOnClick,
    }
    setDragging(true)
  }

  const saveSettings = () => {
    setDeepSeekRuntimeConfig({
      ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
      baseUrl: baseUrlInput.trim() || DEEPSEEK_DEFAULT_BASE_URL,
      model: modelInput.trim() || DEEPSEEK_DEFAULT_MODEL,
    })
    refreshKeyState()
    setApiKeyInput('')
    setSettingsOpen(false)
    setError(null)
    const snapshot = getDeepSeekConfigSnapshot()
    setMessages((current) => [...current, {
      id: uid(),
      role: 'system',
      content: snapshot.apiKeyConfigured
        ? `DeepSeek 已接通（${snapshot.apiKeyMasked} / ${snapshot.model}）。可直接提问验证，例如“你是谁”。`
        : 'DeepSeek API Key 仍未配置，请填写后保存。',
    }])
  }

  const send = async () => {
    const utterance = input.trim()
    if (!utterance || busy || createBusy) return

    setBusy(true)
    setError(null)
    setInput('')
    setMessages((current) => [...current, { id: uid(), role: 'user', content: utterance }])

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const history: DeepSeekChatMessage[] = messages
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({
          role: item.role as 'user' | 'assistant',
          content: stripAssistantAttribution(item.content),
        }))

      const result = await askDeepSeekAssistant({
        utterance,
        history,
        categories,
        departments,
        workOrders,
        employees,
        forceCreate,
        signal: controller.signal,
      })

      const sourceLabel = result.source === 'local-data'
        ? 'local-data（浏览器已加载的工单/员工）'
        : getDeepSeekModel()
      setMessages((current) => [...current, {
        id: uid(),
        role: 'assistant',
        source: result.source,
        content: `${stripAssistantAttribution(result.reply)}\n\n— via ${sourceLabel}`,
      }])
      setDraft(result.intent === 'create_work_order' ? (result.draft ?? null) : null)
    } catch (caught) {
      if (controller.signal.aborted) return
      const message = caught instanceof Error ? caught.message : '助手调用失败。'
      if (/API Key/i.test(message)) setSettingsOpen(true)
      setError(message)
      setMessages((current) => [...current, { id: uid(), role: 'system', content: message }])
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
    }
  }

  const createFromDraft = async () => {
    if (!draft || !canSubmitDraft) return
    try {
      await onCreateWorkOrder(toWorkOrderInputFromAiDraft(draft))
      setMessages((current) => [...current, {
        id: uid(),
        role: 'system',
        content: `工单「${draft.workOrderName}」创建请求已提交。`,
      }])
      setDraft(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建工单失败。')
    }
  }

  return <>
    <div
      className={`ai-dock-fab${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
      role="button"
      tabIndex={0}
      style={{ left: position.left, top: position.top, right: 'auto', bottom: 'auto' }}
      aria-label={open ? '关闭智能助手' : '打开智能助手'}
      onPointerDown={(event) => beginDrag(event, true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setOpen((value) => !value)
        }
      }}
    >
      {open ? '×' : 'AI'}
    </div>

    {open && <section
      className={`ai-dock-panel${dragging ? ' is-dragging' : ''}`}
      style={panelStyle}
      aria-label="DeepSeek 智能助手"
    >
      <header
        className="ai-dock-header ai-dock-drag-handle"
        onPointerDown={(event) => beginDrag(event, false)}
      >
        <div>
          <strong>DeepSeek 助手</strong>
          <span>{keyConfigured ? `${modelLabel} · ${maskedKey || '****'} · 拖标题栏移动` : '待配置 API Key · 拖标题栏移动'}</span>
        </div>
        <div className="ai-dock-header-actions">
          <button className="ai-dock-icon-btn" type="button" onClick={() => setSettingsOpen((value) => !value)}>设置</button>
          <button className="ai-dock-icon-btn" type="button" onClick={() => setOpen(false)}>收起</button>
        </div>
      </header>

      {settingsOpen && <div className="ai-dock-settings">
        <label>API Key
          <input
            type="password"
            autoComplete="off"
            placeholder={keyConfigured ? `已保存 ${maskedKey}，输入新值可覆盖` : '粘贴 DeepSeek API Key'}
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
          />
        </label>
        <label>Base URL
          <input value={baseUrlInput} onChange={(event) => setBaseUrlInput(event.target.value)} placeholder={DEEPSEEK_DEFAULT_BASE_URL} />
        </label>
        <label>Model
          <input value={modelInput} onChange={(event) => setModelInput(event.target.value)} placeholder={DEEPSEEK_DEFAULT_MODEL} />
        </label>
        <div className="ai-dock-settings-actions">
          <button className="button button-quiet" type="button" onClick={() => setSettingsOpen(false)}>取消</button>
          <button className="button button-primary" type="button" onClick={saveSettings}>保存</button>
        </div>
      </div>}

      <div className="ai-dock-mode">
        <button
          type="button"
          className={!forceCreate ? 'is-active' : undefined}
          onClick={() => setForceCreate(false)}
        >智能对话</button>
        <button
          type="button"
          className={forceCreate ? 'is-active' : undefined}
          onClick={() => setForceCreate(true)}
          disabled={!canCreate}
          title={!canCreate ? '当前角色无新建工单权限' : undefined}
        >建单模式</button>
      </div>

      <div className="ai-dock-messages" ref={listRef}>
        {messages.map((item) => (
          <div key={item.id} className={`ai-dock-bubble role-${item.role}`}>{item.content}</div>
        ))}

        {draft && <div className="ai-dock-draft">
          <div className="ai-dock-draft-title">工单草稿
            <span>{draft.confidence == null ? '置信度未知' : `${Math.round(draft.confidence * 100)}%`}</span>
          </div>
          {draft.rationale && <p className="ai-dock-draft-rationale">{draft.rationale}</p>}
          <label>标题
            <input
              value={draft.workOrderName}
              disabled={busy || createBusy}
              onChange={(event) => setDraft((current) => current ? { ...current, workOrderName: event.target.value } : current)}
            />
          </label>
          <label>描述
            <input
              value={draft.issueDescription}
              maxLength={100}
              disabled={busy || createBusy}
              onChange={(event) => setDraft((current) => current ? { ...current, issueDescription: event.target.value } : current)}
            />
          </label>
          <div className="ai-dock-draft-row">
            <label>服务类别
              <select
                value={draft.serviceCategoryId}
                disabled={busy || createBusy}
                onChange={(event) => {
                  const category = activeCategories.find((item) => item.id === event.target.value)
                  setDraft((current) => current ? {
                    ...current,
                    serviceCategoryId: event.target.value,
                    categoryName: category?.serviceCategoryName ?? current.categoryName,
                    departmentId: category?.defaultDepartmentId
                      && activeDepartments.some((item) => item.id === category.defaultDepartmentId)
                      ? category.defaultDepartmentId
                      : current.departmentId,
                    ...(category?.defaultPriority ? { priority: category.defaultPriority } : {}),
                  } : current)
                }}
              >
                <option value="">请选择</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.serviceCategoryName}</option>
                ))}
              </select>
            </label>
            <label>部门
              <select
                value={draft.departmentId}
                disabled={busy || createBusy}
                onChange={(event) => setDraft((current) => current ? { ...current, departmentId: event.target.value } : current)}
              >
                <option value="">请选择</option>
                {activeDepartments.map((department) => (
                  <option key={department.id} value={department.id}>{department.departmentName}</option>
                ))}
              </select>
            </label>
          </div>
          <label>优先级
            <select
              value={draft.priority}
              disabled={busy || createBusy}
              onChange={(event) => setDraft((current) => current ? {
                ...current,
                priority: Number(event.target.value) as AiWorkOrderDraft['priority'],
              } : current)}
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button
            className="button button-primary"
            type="button"
            disabled={!canSubmitDraft}
            onClick={() => { void createFromDraft() }}
          >{createBusy ? '创建中…' : '确认创建工单'}</button>
        </div>}
      </div>

      {error && <p className="ai-dock-error" role="alert">{error}</p>}

      <footer className="ai-dock-composer">
        <textarea
          rows={2}
          maxLength={500}
          placeholder={forceCreate ? '描述故障，例如：财务部笔记本蓝屏…' : '问我任何问题，或切换建单模式…'}
          value={input}
          disabled={busy || createBusy}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button
          className="button button-primary"
          type="button"
          disabled={busy || createBusy || !input.trim()}
          onClick={() => { void send() }}
        >{busy ? 'DeepSeek…' : '发送'}</button>
      </footer>
    </section>}
  </>
}
