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
  type AiEmployeeAvailabilityDraft,
  type DispatchRecommendation,
} from '../../../integrations/deepseek/deepseekAssistantService'
import type { EmployeeResourceUpdate } from '../../../domains/work-orders/services/dataverseResourceCommands'
import { formatAssistantQuerySourceLabel } from '../../../integrations/deepseek/assistantQueryPipeline'
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
  source?: 'local-data' | 'deepseek' | 'deepseek-web' | 'dataverse' | 'dataverse+deepseek'
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
  canEditResources?: boolean
  createBusy?: boolean
  onCreateWorkOrder: (input: WorkOrderInput) => Promise<void> | void
  onUpdateEmployeeAvailability?: (employeeId: string, values: EmployeeResourceUpdate) => Promise<void> | void
  onRequestAssignment?: (workOrder: WorkOrder, employee: EmployeeOption) => void
}

function toDateInput(value: string | null | undefined): string | null {
  if (!value) return null
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (datePart) return datePart
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function toEmployeeGender(value: number | null | undefined): EmployeeResourceUpdate['gender'] {
  if (value === 326990000 || value === 326990001 || value === 326990002) return value
  return null
}

function buildEmployeeAvailabilityUpdate(
  employee: EmployeeOption,
  nextAvailable: boolean,
): EmployeeResourceUpdate {
  return {
    employeeName: employee.employeeName,
    email: employee.email ?? '',
    departmentId: employee.departmentId ?? null,
    gender: toEmployeeGender(employee.genderValue),
    age: employee.age ?? null,
    hireDate: toDateInput(employee.hireDate),
    isActive: employee.isActive,
    isAvailableForOrder: nextAvailable,
    maxTaskLoad: employee.maxTaskLoad ?? null,
    skills: employee.skills ?? '',
  }
}

/** v2: default dock corner is bottom-right; old v1 often stored top-left (24,24). */
const POSITION_STORAGE_KEY = 'opsdesk.aiAssistant.position.v2'
const LEGACY_POSITION_STORAGE_KEY = 'opsdesk.aiAssistant.position'
const FAB_SIZE = 56
const PANEL_WIDTH = 380
const PANEL_GAP = 12
/** Extra inset so the FAB clears Power Apps player chrome / safe areas. */
const SHELL_INSET = 72

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isLowConfidence(fields: string[], key: string): boolean {
  const normalized = key.toLocaleLowerCase()
  return fields.some((field) => field.toLocaleLowerCase().includes(normalized))
}

function defaultPosition(): DockPosition {
  if (typeof window === 'undefined') {
    // Prefer bottom-right once the viewport is known; avoid legacy top-left (24,24).
    return { left: 10000, top: 10000 }
  }
  return {
    left: Math.max(12, window.innerWidth - FAB_SIZE - SHELL_INSET),
    top: Math.max(12, window.innerHeight - FAB_SIZE - SHELL_INSET),
  }
}

function isLegacyTopLeftPosition(position: DockPosition): boolean {
  return position.left <= 32 && position.top <= 32
}

function readStoredPosition(): DockPosition | null {
  try {
    const raw = sessionStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) {
      // Drop legacy top-left defaults so the icon re-homes to bottom-right.
      sessionStorage.removeItem(LEGACY_POSITION_STORAGE_KEY)
      return null
    }
    const parsed = JSON.parse(raw) as DockPosition
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
    if (isLegacyTopLeftPosition(parsed)) {
      sessionStorage.removeItem(POSITION_STORAGE_KEY)
      return null
    }
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
  canEditResources = false,
  createBusy = false,
  onCreateWorkOrder,
  onUpdateEmployeeAvailability,
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
  const [availabilityDraft, setAvailabilityDraft] = useState<AiEmployeeAvailabilityDraft | null>(null)
  const [dispatchAdvice, setDispatchAdvice] = useState<DispatchRecommendation | null>(null)
  const [messages, setMessages] = useState<ChatItem[]>([{
    id: 'welcome',
    role: 'system',
    content: '我是 DeepSeek 助手：业务查询走 Dataverse 只读；建单/派发/改接单状态不会直接写入，只会预建草稿，你可改字段后确认或取消。也可拖入待分派工单问派给谁。按住标题栏或 AI 按钮可拖动。',
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
  const didHomeCornerRef = useRef(false)
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

  // First paint may run before layout is stable; ensure initial home is bottom-right.
  useEffect(() => {
    if (didHomeCornerRef.current) return
    didHomeCornerRef.current = true
    const stored = readStoredPosition()
    const next = clampPosition(stored ?? defaultPosition())
    positionRef.current = next
    setPosition(next)
  }, [])

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
  }, [open, messages, draft, availabilityDraft, error, busy])

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

  const canSubmitAvailability = Boolean(
    availabilityDraft
    && availabilityDraft.employeeId
    && canEditResources
    && onUpdateEmployeeAvailability
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
        permissions: {
          canQueryWorkOrders: true,
          canQueryEmployees: true,
          canViewDispatchAdvice: canAssign,
          canCreateWorkOrder: canCreate,
          canEditResources,
        },
        signal: controller.signal,
      })

      const sourceLabel = result.sourceLabel
        ?? formatAssistantQuerySourceLabel(result.source, result.queryMeta, getDeepSeekModel())
      const citationBlock = result.citations?.length
        ? `\n\n来源：\n${result.citations.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}\n${item.url}`).join('\n')}`
        : ''
      setMessages((current) => [...current, {
        id: uid(),
        role: 'assistant',
        source: result.source,
        content: `${stripAssistantAttribution(result.reply)}${citationBlock}\n\n— via ${sourceLabel}`,
      }])
      if (result.intent === 'create_work_order' && result.draft) {
        setDispatchAdvice(null)
        setAvailabilityDraft(null)
        setDraft(result.draft)
      } else if (result.intent === 'update_employee_availability' && result.availabilityDraft) {
        setDispatchAdvice(null)
        setDraft(null)
        setAvailabilityDraft(result.availabilityDraft)
      } else {
        setDraft(null)
        setAvailabilityDraft(null)
      }
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
        content: `已确认并提交创建工单「${draft.workOrderName}」（由你的账号写入 Dataverse）。`,
      }])
      setDraft(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建工单失败。')
    }
  }

  const cancelDraft = () => {
    if (!draft) return
    const title = draft.workOrderName.trim() || '未命名'
    setDraft(null)
    setMessages((current) => [...current, {
      id: uid(),
      role: 'system',
      content: `已取消工单草稿「${title}」，未写入 Dataverse。`,
    }])
  }

  const cancelAvailabilityDraft = () => {
    if (!availabilityDraft) return
    const name = availabilityDraft.employeeName.trim() || '未选定员工'
    setAvailabilityDraft(null)
    setMessages((current) => [...current, {
      id: uid(),
      role: 'system',
      content: `已取消「${name}」接单状态变更，未写入 Dataverse。`,
    }])
  }

  const confirmAvailabilityDraft = async () => {
    if (!availabilityDraft || !canSubmitAvailability || !onUpdateEmployeeAvailability) return
    const employee = employees.find((item) => item.id === availabilityDraft.employeeId)
    if (!employee) {
      setError('员工已不存在或未加载，请刷新后重试。')
      return
    }
    try {
      await onUpdateEmployeeAvailability(
        employee.id,
        buildEmployeeAvailabilityUpdate(employee, availabilityDraft.nextAvailable),
      )
      setMessages((current) => [...current, {
        id: uid(),
        role: 'system',
        content: `已确认将「${employee.employeeName}」设为${availabilityDraft.nextAvailable ? '可接单' : '不可接单'}（由你的账号写入 Dataverse）。`,
      }])
      setAvailabilityDraft(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '更新接单状态失败。')
    }
  }

  const cancelDispatchAdvice = () => {
    if (!dispatchAdvice) return
    setDispatchAdvice(null)
    setMessages((current) => [...current, {
      id: uid(),
      role: 'system',
      content: '已取消派发建议，未发起派发。',
    }])
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
    setAvailabilityDraft(null)
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
    setDispatchAdvice(null)
    setMessages((current) => [...current, {
      id: uid(),
      role: 'system',
      content: `已确认派给「${employee.employeeName}」，已发起系统派发/审批流程（非 AI 直接写入 Dataverse）。`,
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
          <p className="ai-dock-draft-rationale">AI 不会直接写入 Dataverse；点选后走原有派发/审批流程，也可取消。</p>
          {dispatchAdvice.primary && <button
            className="button button-primary"
            type="button"
            disabled={!canAssign || !onRequestAssignment || busy || createBusy}
            title={!canAssign ? '当前角色无派发权限' : undefined}
            onClick={() => assignFromAdvice(dispatchAdvice.primary!)}
          >确认派给 {dispatchAdvice.primary.employeeName}</button>}
          {dispatchAdvice.alternatives.length > 0 && <div className="ai-dock-assign-alts">
            {dispatchAdvice.alternatives.map((employee) => (
              <button
                key={employee.id}
                className="button button-quiet"
                type="button"
                disabled={!canAssign || !onRequestAssignment || busy || createBusy}
                onClick={() => assignFromAdvice(employee)}
              >改派：{employee.employeeName}</button>
            ))}
          </div>}
          <div className="ai-dock-draft-actions">
            <button
              className="button button-quiet"
              type="button"
              disabled={busy || createBusy}
              onClick={cancelDispatchAdvice}
            >取消</button>
          </div>
        </div>}

        {availabilityDraft && <div className="ai-dock-draft">
          <div className="ai-dock-draft-title">接单状态预建
            <span>{availabilityDraft.nextAvailable ? '→ 可接单' : '→ 不可接单'}</span>
          </div>
          <p className="ai-dock-draft-rationale">
            {availabilityDraft.rationale} 尚未写入 Dataverse。可改选员工或目标状态，确认后才会更新。
          </p>
          <label>员工
            <select
              value={availabilityDraft.employeeId}
              disabled={busy || createBusy}
              onChange={(event) => {
                const selected = employees.find((item) => item.id === event.target.value)
                  ?? availabilityDraft.candidates.find((item) => item.id === event.target.value)
                setAvailabilityDraft((current) => current ? {
                  ...current,
                  employeeId: event.target.value,
                  employeeName: selected?.employeeName ?? current.employeeName,
                  currentAvailable: selected?.isAvailableForOrder ?? current.currentAvailable,
                } : current)
              }}
            >
              <option value="">请选择员工</option>
              {(availabilityDraft.candidates.length
                ? availabilityDraft.candidates
                : employees.filter((item) => item.isActive).map((item) => ({
                  id: item.id,
                  employeeName: item.employeeName,
                  isAvailableForOrder: item.isAvailableForOrder,
                }))
              ).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeName}（{employee.isAvailableForOrder ? '当前可接单' : '当前不可接单'}）
                </option>
              ))}
            </select>
          </label>
          <label>目标接单状态
            <select
              value={availabilityDraft.nextAvailable ? '1' : '0'}
              disabled={busy || createBusy}
              onChange={(event) => setAvailabilityDraft((current) => current ? {
                ...current,
                nextAvailable: event.target.value === '1',
              } : current)}
            >
              <option value="1">可接单</option>
              <option value="0">不可接单</option>
            </select>
          </label>
          {!canEditResources && <p className="ai-dock-draft-warn" role="status">当前角色无编辑资源权限，可预览草稿，但无法确认写入。</p>}
          {canEditResources && !availabilityDraft.employeeId && (
            <p className="ai-dock-draft-warn" role="status">请先选择员工后再确认。</p>
          )}
          <div className="ai-dock-draft-actions">
            <button
              className="button button-quiet"
              type="button"
              disabled={busy || createBusy}
              onClick={cancelAvailabilityDraft}
            >取消</button>
            <button
              className="button button-primary"
              type="button"
              disabled={!canSubmitAvailability}
              title={!canEditResources ? '当前角色无编辑资源权限' : undefined}
              onClick={() => { void confirmAvailabilityDraft() }}
            >{createBusy ? '更新中…' : '确认更新'}</button>
          </div>
        </div>}

        {draft && <div className="ai-dock-draft">
          <div className="ai-dock-draft-title">工单预建草稿
            <span>{draft.confidence == null ? '置信度未知' : `${Math.round(draft.confidence * 100)}%`}</span>
          </div>
          <p className="ai-dock-draft-rationale">
            {draft.rationale ? `${draft.rationale} ` : ''}
            尚未写入 Dataverse。可直接改字段，确认后才会创建；取消则丢弃。
          </p>
          <label className={isLowConfidence(draft.lowConfidenceFields, 'workordername') || isLowConfidence(draft.lowConfidenceFields, 'title') ? 'field-low-confidence' : undefined}>
            标题
            <input
              value={draft.workOrderName}
              disabled={busy || createBusy}
              onChange={(event) => setDraft((current) => current ? { ...current, workOrderName: event.target.value } : current)}
            />
          </label>
          <label className={isLowConfidence(draft.lowConfidenceFields, 'issuedescription') || isLowConfidence(draft.lowConfidenceFields, 'description') ? 'field-low-confidence' : undefined}>
            描述
            <input
              value={draft.issueDescription}
              maxLength={100}
              disabled={busy || createBusy}
              onChange={(event) => setDraft((current) => current ? { ...current, issueDescription: event.target.value } : current)}
            />
          </label>
          <div className="ai-dock-draft-row">
            <label className={isLowConfidence(draft.lowConfidenceFields, 'category') ? 'field-low-confidence' : undefined}>
              服务类别
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
            <label className={isLowConfidence(draft.lowConfidenceFields, 'department') ? 'field-low-confidence' : undefined}>
              部门
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
          <label className={isLowConfidence(draft.lowConfidenceFields, 'priority') ? 'field-low-confidence' : undefined}>
            优先级
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
          {!canCreate && <p className="ai-dock-draft-warn" role="status">当前角色无新建工单权限，可预览/修改草稿，但无法确认写入。</p>}
          {canCreate && (!draft.serviceCategoryId || !draft.departmentId || !draft.workOrderName.trim()) && (
            <p className="ai-dock-draft-warn" role="status">请补全标题、服务类别和部门后再确认创建。</p>
          )}
          <div className="ai-dock-draft-actions">
            <button
              className="button button-quiet"
              type="button"
              disabled={busy || createBusy}
              onClick={cancelDraft}
            >取消</button>
            <button
              className="button button-primary"
              type="button"
              disabled={!canSubmitDraft}
              title={!canCreate ? '当前角色无新建工单权限' : undefined}
              onClick={() => { void createFromDraft() }}
            >{createBusy ? '创建中…' : '确认创建'}</button>
          </div>
        </div>}
      </div>

      {error && <p className="ai-dock-error" role="alert">{error}</p>}

      <footer className="ai-dock-composer">
        <textarea
          rows={2}
          maxLength={500}
          placeholder={forceCreate ? '描述故障，例如：财务部笔记本蓝屏…' : '请输入您的问题'}
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
