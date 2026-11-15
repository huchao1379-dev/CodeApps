import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
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
  recommendDispatchAssignment,
  stripAssistantAttribution,
  type DispatchRecommendation,
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
  source?: 'local-data' | 'deepseek' | 'deepseek-web' | 'dataverse'
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
  canAssign?: boolean
  createBusy?: boolean
  onCreateWorkOrder: (input: WorkOrderInput) => Promise<void> | void
  onRequestAssignment?: (workOrder: WorkOrder, employee: EmployeeOption) => void
}

const POSITION_STORAGE_KEY = 'opsdesk.aiAssistant.position'
const FAB_SIZE = 56
const PANEL_WIDTH = 380
const PANEL_GAP = 12
/** Extra inset so the FAB clears Power Apps player chrome / safe areas. */
const SHELL_INSET = 72

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultPosition(): DockPosition {
  if (typeof window === 'undefined') return { left: 24, top: 24 }
  return {
    left: Math.max(12, window.innerWidth - FAB_SIZE - SHELL_INSET),
    top: Math.max(12, window.innerHeight - FAB_SIZE - SHELL_INSET),
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
  canAssign = false,
  createBusy = false,
  onCreateWorkOrder,
  onRequestAssignment,
}: AiAssistantDockProps) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [forceCreate, setForceCreate] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<AiWorkOrderDraft | null>(null)
  const [dispatchAdvice, setDispatchAdvice] = useState<DispatchRecommendation | null>(null)
  const [messages, setMessages] = useState<ChatItem[]>([{
    id: 'welcome',
    role: 'system',
    content: '我是 DeepSeek 助手：查工单/空闲/逾期等会走 Dataverse 实时查询；外网问题可 Search/Fetch。也可从派发看板把待分派工单拖到这里问派给谁。按住标题栏或 AI 按钮可拖动。',
  }])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState(DEEPSEEK_DEFAULT_BASE_URL)
  const [modelInput, setModelInput] = useState(DEEPSEEK_DEFAULT_MODEL)
  const [keyConfigured, setKeyConfigured] = useState(hasDeepSeekApiKey())
  const [maskedKey, setMaskedKey] = useState(getDeepSeekConfigSnapshot().apiKeyMasked)
  const [modelLabel, setModelLabel] = useState(getDeepSeekModel())
  const [position, setPosition] = useState<DockPosition>(() => clampPosition(readStoredPosition() ?? defaultPosition()))
  const [dragging, setDragging] = useState(false)
  const [portalReady, setPortalReady] = useState(() => typeof document !== 'undefined')
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
        ? 'local-data（页面缓存降级）'
        : result.source === 'dataverse'
          ? 'dataverse（实时 $filter）'
          : result.source === 'deepseek-web'
            ? `${getDeepSeekModel()} + web`
            : getDeepSeekModel()
      const citationBlock = result.citations?.length
        ? `\n\n来源：\n${result.citations.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}\n${item.url}`).join('\n')}`
        : ''
      setMessages((current) => [...current, {
        id: uid(),
        role: 'assistant',
        source: result.source,
        content: `${stripAssistantAttribution(result.reply)}${citationBlock}\n\n— via ${sourceLabel}`,
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

  const runDispatchAdvice = async (workOrderId: string) => {
    const workOrder = workOrders.find((item) => item.id === workOrderId)
    if (!workOrder) {
      setError('未找到拖入的工单，请刷新后重试。')
      return
    }
    setOpen(true)
    setForceCreate(false)
    setDraft(null)
    setDispatchAdvice(null)
    setBusy(true)
    setError(null)
    setMessages((current) => [...current, {
      id: uid(),
      role: 'user',
      content: `请根据当前人员负载，建议把工单「${workOrder.workOrderNumber || workOrder.workOrderName}」派给谁？`,
    }])

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const advice = await recommendDispatchAssignment({
        workOrder,
        employees,
        workOrders,
        signal: controller.signal,
      })
      const sourceLabel = advice.source === 'local-data'
        ? 'local-data（负载规则）'
        : getDeepSeekModel()
      setDispatchAdvice(advice)
      setMessages((current) => [...current, {
        id: uid(),
        role: 'assistant',
        source: advice.source,
        content: `${stripAssistantAttribution(advice.reply)}\n\n— via ${sourceLabel}`,
      }])
    } catch (caught) {
      if (controller.signal.aborted) return
      const message = caught instanceof Error ? caught.message : '派发建议失败。'
      if (/API Key/i.test(message)) setSettingsOpen(true)
      setError(message)
      setMessages((current) => [...current, { id: uid(), role: 'system', content: message }])
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
    }
  }

  const onWorkOrderDragOver = (event: DragEvent<HTMLElement>) => {
    const types = [...event.dataTransfer.types]
    // Some browsers expose custom types only as 'Text' / lowercase variants during dragover.
    const canAccept = types.some((type) => (
      type === 'text/work-order-id'
      || type === 'text/plain'
      || type.toLowerCase() === 'text'
    ))
    if (!canAccept) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }

  const onWorkOrderDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDropActive(false)
  }

  const onWorkOrderDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDropActive(false)
    const workOrderId = event.dataTransfer.getData('text/work-order-id') || event.dataTransfer.getData('text/plain')
    if (!workOrderId) {
      setError('未识别到工单，请从派发看板的待分派列表拖入。')
      return
    }
    void runDispatchAdvice(workOrderId)
  }

  const assignFromAdvice = (employee: EmployeeOption) => {
    if (!dispatchAdvice || !onRequestAssignment || !canAssign) return
    const workOrder = workOrders.find((item) => item.id === dispatchAdvice.workOrderId)
    if (!workOrder) {
      setError('工单已不存在或已变更，请重新拖入。')
      return
    }
    onRequestAssignment(workOrder, employee)
    setMessages((current) => [...current, {
      id: uid(),
      role: 'system',
      content: `已发起派给「${employee.employeeName}」的派发流程（仍走系统原有派发/审批，不是 AI 直接改库）。`,
    }])
  }

  useEffect(() => {
    setPortalReady(typeof document !== 'undefined')
  }, [])

  // Portal to body so Power Apps player transform/overflow cannot clip the FAB.
  const dock = <>
    <div
      className={`ai-dock-fab${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${dropActive ? ' is-drop-target' : ''}`}
      role="button"
      tabIndex={0}
      style={{ left: position.left, top: position.top, right: 'auto', bottom: 'auto' }}
      aria-label={open ? '关闭智能助手' : '打开智能助手'}
      onPointerDown={(event) => beginDrag(event, true)}
      onDragOver={onWorkOrderDragOver}
      onDragLeave={onWorkOrderDragLeave}
      onDrop={onWorkOrderDrop}
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
      className={`ai-dock-panel${dragging ? ' is-dragging' : ''}${dropActive ? ' is-drop-target' : ''}`}
      style={panelStyle}
      aria-label="DeepSeek 智能助手"
      onDragOver={onWorkOrderDragOver}
      onDragLeave={onWorkOrderDragLeave}
      onDrop={onWorkOrderDrop}
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

      {dropActive && <div className="ai-dock-drop-hint" role="status">松开以询问：该工单更适合派给谁</div>}

      <div className="ai-dock-messages" ref={listRef}>
        {messages.map((item) => (
          <div key={item.id} className={`ai-dock-bubble role-${item.role}`}>{item.content}</div>
        ))}

        {dispatchAdvice && (dispatchAdvice.primary || dispatchAdvice.alternatives.length > 0) && <div className="ai-dock-draft">
          <div className="ai-dock-draft-title">派发建议
            <span>{dispatchAdvice.source === 'deepseek' ? 'DeepSeek + 负载' : '本地负载规则'}</span>
          </div>
          {dispatchAdvice.primary && <button
            className="button button-primary"
            type="button"
            disabled={!canAssign || !onRequestAssignment || busy || createBusy}
            title={!canAssign ? '当前角色无派发权限' : undefined}
            onClick={() => assignFromAdvice(dispatchAdvice.primary!)}
          >建议派给 {dispatchAdvice.primary.employeeName}</button>}
          {dispatchAdvice.alternatives.length > 0 && <div className="ai-dock-assign-alts">
            {dispatchAdvice.alternatives.map((employee) => (
              <button
                key={employee.id}
                className="button button-quiet"
                type="button"
                disabled={!canAssign || !onRequestAssignment || busy || createBusy}
                onClick={() => assignFromAdvice(employee)}
              >备选：{employee.employeeName}</button>
            ))}
          </div>}
          <p className="ai-dock-draft-rationale">AI 只给建议；确认后仍走原有派发/审批流程。</p>
        </div>}

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

  if (!portalReady || typeof document === 'undefined') return null
  return createPortal(dock, document.body)
}
