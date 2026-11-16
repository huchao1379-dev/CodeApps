import {
  buildCategoryCatalog,
  resolveAiDraftAgainstCatalog,
  type AiWorkOrderDraft,
} from '../power-automate/aiWorkOrderDraftAdapter'
import {
  PRIORITY,
  STATUS_LABELS,
  type DepartmentOption,
  type EmployeeOption,
  type Priority,
  type ServiceCategoryOption,
  type WorkOrder,
} from '../../domains/work-orders/types/workOrder.types'
import { createDeepSeekChatCompletion, type DeepSeekChatMessage } from './deepseekClient'
import { getDeepSeekModel, hasDeepSeekApiKey } from './deepseekConfig'
import {
  extractAssigneeName,
  formatAssistantDataToolForPrompt,
  type AssistantDataToolResult,
} from './assistantDataTools'
import {
  formatAssistantQuerySourceLabel,
  runAssistantQueryPipeline,
  type AssistantQueryMeta,
  type AssistantQueryPermissions,
  type AssistantQuerySource,
} from './assistantQueryPipeline'
import {
  deepSeekFetch,
  deepSeekSearch,
  extractHttpUrls,
  formatFetchEvidenceForPrompt,
  formatSearchEvidenceForPrompt,
  type DeepSeekFetchPage,
  type DeepSeekSearchResult,
} from './deepseekToolsClient'
import { buildWorkspaceSnapshot, formatWorkspaceSnapshotForPrompt } from './workspaceSnapshot'

export type AssistantIntent = 'chat' | 'create_work_order' | 'update_employee_availability' | 'query'

/** Human-confirmed draft for toggling an employee's 接单状态. AI never writes Dataverse. */
export type AiEmployeeAvailabilityDraft = {
  employeeId: string
  employeeName: string
  currentAvailable: boolean
  nextAvailable: boolean
  rationale: string
  candidates: Array<{ id: string; employeeName: string; isAvailableForOrder: boolean }>
}

export type AssistantCitation = {
  title: string
  url: string
}

export type AssistantReply = {
  intent: AssistantIntent
  reply: string
  draft?: AiWorkOrderDraft
  availabilityDraft?: AiEmployeeAvailabilityDraft
  /** Where the answer came from; UI should show this once. */
  source: AssistantQuerySource
  citations?: AssistantCitation[]
  /** Ops-data pipeline metadata (timing / failures / presentation mode). */
  queryMeta?: AssistantQueryMeta
  /** Ready-to-show attribution, e.g. dataverse 只读查询（2/2 步成功 · 320ms） */
  sourceLabel?: string
}

/** Remove UI attribution lines so the model does not echo “via …”. */
export function stripAssistantAttribution(content: string): string {
  return content
    .replace(/\n*\s*—\s*via\s+[^\n]+/gi, '')
    .replace(/\n*\s*-\s*via\s+[^\n]+/gi, '')
    .trim()
}

function firstText(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1 ? Math.min(value / 100, 1) : Math.max(0, Math.min(value, 1))
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/%$/, '')
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return parsed > 1 ? Math.min(parsed / 100, 1) : Math.max(0, Math.min(parsed, 1))
}

function splitList(value: string): string[] {
  return value
    .split(/[,，;；|]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function mapPriorityLabel(label: string): Priority {
  const normalized = label.trim().toLocaleLowerCase()
  if (!normalized) return PRIORITY.medium
  if (/(紧急|critical|urgent|p0|最高)/i.test(normalized)) return PRIORITY.critical
  if (/(高|high|p1)/i.test(normalized)) return PRIORITY.high
  if (/(低|low|p3)/i.test(normalized)) return PRIORITY.low
  if (/(中|普通|medium|normal|p2)/i.test(normalized)) return PRIORITY.medium
  return PRIORITY.medium
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    }
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    }
    throw new Error('模型返回不是有效 JSON。')
  }
}

/** 明确修改员工接单状态（人机确认后再写库）。 */
export function looksLikeAvailabilityUpdate(text: string): boolean {
  return /(设为|改为|改成|调整|更新|修改|切换).{0,16}(可接单|不可接单|暂不可接单|接单状态)/i.test(text)
    || /接单状态.{0,12}(设为|改为|改成|调整|更新|修改)/i.test(text)
    || /(暂停接单|恢复接单|打开接单|关闭接单|停止接单)/i.test(text)
}

/** 明确查询/统计意图，绝不能走建单。 */
export function looksLikeDataQuery(text: string): boolean {
  if (looksLikeAvailabilityUpdate(text)) return false
  return /(查询|查一下|统计|多少|几个|数量|有哪些|列表|概况|概览|汇总|占比|分布|当前.*工单|工单.*(多少|数量|几个)|高优先级|紧急工单|未分派|待派单|代派单|逾期|空闲|可接单|谁可以派|负责人|指派给|分派给|名下|适合|适配|推荐派)/i.test(text)
}

/** 明确建单意图。 */
export function looksLikeCreateRequest(text: string): boolean {
  if (looksLikeAvailabilityUpdate(text) || looksLikeDataQuery(text)) return false
  return /(建单|创建工单|新建工单|帮我创建|提交工单|报修|帮忙处理一下故障|登记工单|帮我建|开个工单|立个工单)/i.test(text)
    || (/(故障|蓝屏|无法开机|开不了机|连不上网|打印机坏了|网络中断|邮箱登不上)/i.test(text) && !/(查询|多少|统计)/i.test(text))
}

function parseAvailabilityTarget(text: string): boolean | null {
  if (/(不可接单|暂不可接单|暂停接单|关闭接单|停止接单|不能接单)/i.test(text)) return false
  if (/(恢复接单|打开接单|设为可接单|改为可接单|改成可接单|调整为可接单)/i.test(text)) return true
  if (/(可接单)/i.test(text) && !/(不可|暂不)/i.test(text)) return true
  return null
}

function matchEmployeesByNameHint(employees: EmployeeOption[], hint: string): EmployeeOption[] {
  const normalized = hint.trim().toLocaleLowerCase()
  if (!normalized) return []
  const exact = employees.filter((item) => item.employeeName.trim().toLocaleLowerCase() === normalized)
  if (exact.length) return exact
  return employees.filter((item) => {
    const name = item.employeeName.trim().toLocaleLowerCase()
    return name.includes(normalized) || normalized.includes(name)
  })
}

function extractEmployeeNameHint(text: string, employees: EmployeeOption[]): string | null {
  const sorted = [...employees]
    .filter((item) => item.employeeName.trim())
    .sort((left, right) => right.employeeName.length - left.employeeName.length)
  for (const employee of sorted) {
    if (text.includes(employee.employeeName)) return employee.employeeName
  }
  const patterned = text.match(
    /(?:把|将|给)\s*([^\s把将给的之，,。！!？?]{1,20}?)(?:的)?(?:接单状态|接单|设为|改为|改成|调整|更新|修改|暂停|恢复|打开|关闭|停止)/i,
  )
  return patterned?.[1]?.trim() || null
}

export function parseEmployeeAvailabilityDraft(
  utterance: string,
  employees: EmployeeOption[],
): AiEmployeeAvailabilityDraft | null {
  if (!looksLikeAvailabilityUpdate(utterance)) return null
  const hint = extractEmployeeNameHint(utterance, employees)
  const candidates = hint
    ? matchEmployeesByNameHint(employees, hint)
    : []
  const target = parseAvailabilityTarget(utterance)
  const primary = candidates.length === 1 ? candidates[0] : null
  const nextAvailable = primary
    ? (target ?? !primary.isAvailableForOrder)
    : (target ?? true)

  return {
    employeeId: primary?.id ?? '',
    employeeName: primary?.employeeName ?? (hint ?? ''),
    currentAvailable: primary?.isAvailableForOrder ?? false,
    nextAvailable,
    rationale: primary
      ? `拟将「${primary.employeeName}」从${primary.isAvailableForOrder ? '可接单' : '不可接单'}改为${nextAvailable ? '可接单' : '不可接单'}。`
      : hint
        ? `未唯一匹配员工「${hint}」，请在下方选择后再确认。`
        : '未识别到员工姓名，请在下方选择后再确认。',
    candidates: (candidates.length ? candidates : employees.filter((item) => item.isActive))
      .slice(0, 30)
      .map((item) => ({
        id: item.id,
        employeeName: item.employeeName,
        isAvailableForOrder: item.isAvailableForOrder,
      })),
  }
}

/** 需要联网搜索/抓取的外部问题（可与工单问题并存于同一句）。 */
export function looksLikeWebLookup(text: string): boolean {
  if (extractHttpUrls(text, 1).length > 0) return true
  return /(搜索|搜一下|搜下|联网|上网查|查网上|网页|官网|官方文档|最新|实时|今天|今日|昨天|新闻|天气|气温|股价|汇率|发布了|有没有更新|是什么|怎么用|如何配置|教程|笑话|写一首|翻译)/i.test(text)
}

function hasWorkbenchAsk(text: string): boolean {
  return looksLikeDataQuery(text)
    || /(工单|派单|员工|负载|逾期|未分派|待派单|代派单|空闲|可接单|负责人|指派给|分派给|适合|适配|SLA|运维)/i.test(text)
}

/** Non-ops ask that should not be trapped inside Dataverse-only synthesis. */
function hasGeneralAsk(text: string): boolean {
  if (extractHttpUrls(text, 1).length > 0) return true
  // Keep this stricter than looksLikeWebLookup so “今天有多少工单” stays ops-only.
  return /(天气|气温|新闻|股价|汇率|笑话|写一篇|写一首|翻译|解释一下|你是谁|讲个故事|教程|怎么用|如何配置|官网|官方文档)/i.test(text)
}

function buildSearchQuery(utterance: string): string {
  const cleaned = utterance
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(请|帮我|麻烦|一下|看看|查询|搜索|搜一下|搜下|联网|上网查|查网上)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(cleaned || utterance.trim()).slice(0, 128).join('')
}

async function synthesizeOpsAndGeneral(input: {
  utterance: string
  evidence: AssistantDataToolResult
  failures: string[]
  webEvidence: string
  signal?: AbortSignal
}): Promise<string> {
  const failureBlock = input.failures.length
    ? `【Dataverse 查询告警】\n${input.failures.join('\n')}`
    : ''
  return createDeepSeekChatCompletion({
    signal: input.signal,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: [
          '你是通用智能助手，同时可使用工作台 Dataverse 业务证据。',
          '用户可能在同一句里问多个子问题：按子问题分段回答。',
          '工单/员工/派单等业务数字：只能依据下方 Dataverse 证据，不要编造。',
          '天气/新闻/百科/写作等非工单问题：依据联网检索结果回答；若没有检索材料，请明确说无法保证实时准确性，不要假装查到了。',
          '不要因为缺少天气数据就拒绝回答整句里的工单部分，也不要用 Dataverse 证据否定天气问题。',
          '不要在回复末尾添加 “via …” 署名。',
          formatAssistantDataToolForPrompt(input.evidence),
          failureBlock,
          input.webEvidence || '【联网检索】本次未获得可用网页材料。',
        ].filter(Boolean).join('\n'),
      },
      { role: 'user', content: input.utterance },
    ],
  })
}

async function gatherWebEvidence(input: {
  utterance: string
  signal?: AbortSignal
}): Promise<{
  evidence: string
  citations: AssistantCitation[]
  usedFetch: boolean
  usedSearch: boolean
}> {
  const urls = extractHttpUrls(input.utterance, 2)
  const pages: DeepSeekFetchPage[] = []
  const searchResults: DeepSeekSearchResult[] = []

  for (const url of urls) {
    try {
      pages.push(await deepSeekFetch({ url, signal: input.signal }))
    } catch {
      // Keep going; search may still help if fetch is blocked.
    }
  }

  const shouldSearch = urls.length === 0 || pages.length === 0
  if (shouldSearch && looksLikeWebLookup(input.utterance)) {
    try {
      const results = await deepSeekSearch({
        query: buildSearchQuery(input.utterance),
        count: 5,
        needContent: false,
        oriQuestion: Array.from(input.utterance.trim()).slice(0, 128).join(''),
        signal: input.signal,
      })
      searchResults.push(...results)
    } catch {
      // Fall back to model-only answer when search fails.
    }
  }

  // Enrich the top high-quality hit when summaries alone may be thin and no page was fetched.
  if (pages.length === 0 && searchResults.length > 0) {
    const top = [...searchResults].sort((a, b) => b.rerankScore - a.rerankScore)[0]
    if (top && top.rerankScore >= 1.5 && top.url) {
      try {
        pages.push(await deepSeekFetch({ url: top.url, signal: input.signal }))
      } catch {
        // Summaries remain usable without fetch.
      }
    }
  }

  const citations: AssistantCitation[] = []
  for (const page of pages) {
    if (!citations.some((item) => item.url === page.url)) {
      citations.push({ title: page.title, url: page.url })
    }
  }
  for (const result of searchResults) {
    if (!citations.some((item) => item.url === result.url)) {
      citations.push({ title: result.title, url: result.url })
    }
  }

  const parts: string[] = []
  if (pages.length > 0) parts.push(`【网页抓取】\n${formatFetchEvidenceForPrompt(pages)}`)
  if (searchResults.length > 0) parts.push(`【网页搜索】\n${formatSearchEvidenceForPrompt(searchResults)}`)

  return {
    evidence: parts.join('\n\n'),
    citations: citations.slice(0, 8),
    usedFetch: pages.length > 0,
    usedSearch: searchResults.length > 0,
  }
}

function answerLocallyFromSnapshot(
  snapshot: ReturnType<typeof buildWorkspaceSnapshot>,
  utterance: string,
  workOrders: WorkOrder[] = [],
): string | null {
  if (/(空闲|可接单|有空|空着的员工|谁可以派)/i.test(utterance)) {
    if (snapshot.idleEmployees.length === 0) {
      return [
        '按当前负载规则，没有可判定为空闲的员工。',
        `在岗员工 ${snapshot.employees.length} 人；空闲定义：可接单且当前活跃工单未达最大负载（无最大负载时要求负载为 0）。`,
      ].join('\n')
    }
    const lines = [`当前空闲/可接单员工 ${snapshot.idleEmployees.length} 人：`]
    for (const item of snapshot.idleEmployees.slice(0, 12)) {
      const capacity = item.maxTaskLoad == null
        ? `负载 ${item.currentLoad}`
        : `负载 ${item.currentLoad}/${item.maxTaskLoad}`
      lines.push(`- ${item.name}（${item.department}，${capacity}）`)
    }
    return lines.join('\n')
  }

  const assigneeName = extractAssigneeName(utterance)
  if (assigneeName && workOrders.length > 0) {
    const hint = assigneeName.toLocaleLowerCase()
    const matched = workOrders.filter((order) => {
      const name = (order.assignedToName ?? '').toLocaleLowerCase()
      return name.includes(hint) || hint.includes(name)
    })
    const lines = [
      `页面已加载缓存中，负责人匹配「${assigneeName}」的工单共 ${matched.length} 条。`,
      matched.length > 0 ? '样例：' : '没有找到匹配工单。',
      ...matched.slice(0, 8).map((order) => (
        `- ${order.workOrderNumber || order.id} ${order.workOrderName}（${STATUS_LABELS[order.status]} / ${order.assignedToName ?? '未分派'}）`
      )),
    ]
    return lines.join('\n')
  }

  const askCount = /(多少|数量|几个|查询|统计|有哪些|概况|概览|汇总)/i.test(utterance)
  if (!askCount && !/(未分派|逾期|状态分布|优先级)/i.test(utterance)) return null

  if (/(高优先|优先级.*高|高优先级工单)/i.test(utterance)) {
    const high = snapshot.byPriority['高'] ?? 0
    const critical = snapshot.byPriority['紧急'] ?? 0
    const lines = [
      `当前高优先级工单（优先级=高）共 ${high} 条；紧急共 ${critical} 条；高+紧急合计 ${snapshot.highOrCritical} 条。`,
      `工单总数 ${snapshot.total}（基于当前工作台已加载的 Dataverse 数据，本地精确统计）。`,
    ]
    if (snapshot.sampleHighPriority.length > 0) {
      lines.push('样例：')
      for (const item of snapshot.sampleHighPriority.slice(0, 5)) {
        lines.push(`- ${item.number} ${item.name}（${item.priority} / ${item.status} / ${item.assignee}）`)
      }
    }
    return lines.join('\n')
  }

  if (/(未分派)/i.test(utterance)) {
    return `当前未分派工单 ${snapshot.unassigned} 条；工单总数 ${snapshot.total}。`
  }

  if (/(逾期)/i.test(utterance)) {
    return `当前逾期（活跃状态且超过预计完成时间）工单 ${snapshot.overdue} 条；工单总数 ${snapshot.total}。`
  }

  // Assignee-scoped count must not report the global total.
  if (!assigneeName && /(总数|全部工单|工单数量|工单总数|多少(?:个|张)?工单|工单(?:有)?多少|有多少工单)/i.test(utterance)) {
    return [
      `当前已加载工单总数 ${snapshot.total}。`,
      `状态分布：${JSON.stringify(snapshot.byStatus)}`,
      `优先级分布：${JSON.stringify(snapshot.byPriority)}`,
    ].join('\n')
  }

  if (/(状态分布|优先级分布|概况|概览|汇总)/i.test(utterance)) {
    return [
      `工单总数 ${snapshot.total}。`,
      `状态：${JSON.stringify(snapshot.byStatus)}`,
      `优先级：${JSON.stringify(snapshot.byPriority)}`,
      `未分派 ${snapshot.unassigned}，逾期 ${snapshot.overdue}，高+紧急 ${snapshot.highOrCritical}。`,
    ].join('\n')
  }

  return null
}

export async function parseWorkOrderDraftWithDeepSeek(
  utterance: string,
  categories: ServiceCategoryOption[],
  departments: DepartmentOption[],
  signal?: AbortSignal,
): Promise<AiWorkOrderDraft> {
  const text = utterance.trim()
  if (!text) throw new Error('请先输入需求描述。')

  const categoryCatalog = buildCategoryCatalog(categories)
  const content = await createDeepSeekChatCompletion({
    signal,
    temperature: 0.1,
    responseFormat: 'json_object',
    messages: [
      {
        role: 'system',
        content: [
          '你是 IT 服务台助手，从用户描述抽取工单字段。',
          '只输出 JSON 对象，不要 markdown。',
          '字段：workordername, issuedescription, prioritylabel(低|中|高|紧急), categoryname, departmenthint, confidence(0-1), lowconfidencefields(字符串数组), rationale。',
          categoryCatalog ? `可选服务类别：${categoryCatalog}` : '服务类别未知时 categoryname 置空。',
        ].join('\n'),
      },
      { role: 'user', content: text },
    ],
  })

  const payload = extractJsonObject(content)
  const workOrderName = firstText(payload.workordername, payload.workOrderName, payload.title)
  const issueDescription = firstText(payload.issuedescription, payload.issueDescription, payload.description)
  const priorityLabel = firstText(payload.prioritylabel, payload.priorityLabel, payload.priority)
  const categoryName = firstText(payload.categoryname, payload.categoryName, payload.category)
  const departmentHint = firstText(payload.departmenthint, payload.departmentHint, payload.department)
  const rationale = firstText(payload.rationale, payload.reason, payload.message)
  const lowConfidenceFields = Array.isArray(payload.lowconfidencefields)
    ? payload.lowconfidencefields.map(String)
    : splitList(firstText(payload.lowconfidencefields, payload.lowConfidenceFields))
  const confidence = normalizeConfidence(payload.confidence)

  if (!workOrderName && !issueDescription) {
    throw new Error(rationale || '未能从描述中抽取工单标题或问题描述。')
  }

  return resolveAiDraftAgainstCatalog({
    workOrderName: (workOrderName || issueDescription.slice(0, 40) || 'AI 生成工单').slice(0, 850),
    issueDescription: (issueDescription || workOrderName).slice(0, 100),
    priority: mapPriorityLabel(priorityLabel),
    priorityLabel: priorityLabel || '普通',
    categoryName,
    departmentHint,
    confidence,
    lowConfidenceFields,
    rationale,
  }, departments, categories)
}

export async function askDeepSeekAssistant(input: {
  utterance: string
  history?: DeepSeekChatMessage[]
  categories: ServiceCategoryOption[]
  departments: DepartmentOption[]
  workOrders?: WorkOrder[]
  employees?: EmployeeOption[]
  forceCreate?: boolean
  /** Workspace RBAC flags used by the query pipeline permission gate. */
  permissions?: Partial<AssistantQueryPermissions>
  signal?: AbortSignal
}): Promise<AssistantReply> {
  const utterance = input.utterance.trim()
  if (!utterance) throw new Error('请输入内容。')

  const snapshot = buildWorkspaceSnapshot(input.workOrders ?? [], input.employees ?? [])
  const employees = input.employees ?? []
  const availabilityDraft = !input.forceCreate
    ? parseEmployeeAvailabilityDraft(utterance, employees)
    : null

  if (availabilityDraft) {
    const canEdit = input.permissions?.canEditResources !== false
    const permissionHint = canEdit
      ? '确认后才会用你的账号写入 Dataverse；也可改选员工/状态或取消。'
      : '当前角色无编辑资源权限：可预览草稿，但无法确认写入。'
    const named = availabilityDraft.employeeId
      ? `「${availabilityDraft.employeeName}」→ ${availabilityDraft.nextAvailable ? '可接单' : '不可接单'}`
      : '请先选定员工与目标状态'
    return {
      intent: 'update_employee_availability',
      reply: `已预建接单状态变更（${named}）。${permissionHint}`,
      availabilityDraft,
      source: 'local-data',
      sourceLabel: 'local-data（接单状态预建，待确认）',
    }
  }

  const isQuery = !input.forceCreate && looksLikeDataQuery(utterance)
  const shouldCreate = input.forceCreate || (!isQuery && looksLikeCreateRequest(utterance))

  if (shouldCreate) {
    const draft = await parseWorkOrderDraftWithDeepSeek(
      utterance,
      input.categories,
      input.departments,
      input.signal,
    )
    const missing: string[] = []
    if (!draft.workOrderName.trim()) missing.push('标题')
    if (!draft.serviceCategoryId) missing.push('服务类别')
    if (!draft.departmentId) missing.push('负责部门')
    const canCreate = input.permissions?.canCreateWorkOrder !== false
    const confidenceText = draft.confidence == null ? '未知' : `${Math.round(draft.confidence * 100)}%`
    const permissionHint = canCreate
      ? '确认后才会用你的账号写入 Dataverse；也可改字段或取消。'
      : '当前角色无新建权限：可预览/修改草稿，但无法确认写入。'
    return {
      intent: 'create_work_order',
      reply: missing.length
        ? `已预建工单草稿（置信度 ${confidenceText}），还需补全：${missing.join('、')}。${permissionHint}`
        : `已预建工单草稿（置信度 ${confidenceText}）。${permissionHint}`,
      draft,
      source: 'deepseek',
      sourceLabel: formatAssistantQuerySourceLabel('deepseek', null, getDeepSeekModel()),
    }
  }

  // Ops-data pipeline for workbench asks. General/web asks are answered separately
  // (or merged) so weather/jokes/etc. are never trapped in Dataverse-only evidence.
  const workbenchAsk = hasWorkbenchAsk(utterance)
  const generalAsk = hasGeneralAsk(utterance)
  const shouldRunPipeline = workbenchAsk

  let pipelineError: string | null = null
  if (shouldRunPipeline) {
    try {
      const pipeline = await runAssistantQueryPipeline({
        utterance,
        signal: input.signal,
        permissions: {
          canQueryWorkOrders: input.permissions?.canQueryWorkOrders ?? true,
          canQueryEmployees: input.permissions?.canQueryEmployees ?? true,
          canViewDispatchAdvice: input.permissions?.canViewDispatchAdvice ?? true,
        },
      })

      if (pipeline.hit) {
        if (generalAsk && hasDeepSeekApiKey() && pipeline.evidence) {
          const gathered = await gatherWebEvidence({ utterance, signal: input.signal })
          const mixed = stripAssistantAttribution(await synthesizeOpsAndGeneral({
            utterance,
            evidence: pipeline.evidence,
            failures: pipeline.meta.failures,
            webEvidence: gathered.evidence,
            signal: input.signal,
          }))
          const usedWeb = Boolean(gathered.evidence) && (gathered.usedFetch || gathered.usedSearch)
          return {
            intent: 'query',
            reply: mixed,
            source: usedWeb ? 'dataverse+deepseek' : pipeline.source,
            queryMeta: pipeline.meta,
            sourceLabel: formatAssistantQuerySourceLabel(
              pipeline.source,
              pipeline.meta,
              getDeepSeekModel(),
              { withWeb: usedWeb },
            ),
            citations: usedWeb ? gathered.citations : undefined,
          }
        }

        return {
          intent: 'query',
          reply: stripAssistantAttribution(pipeline.reply),
          source: pipeline.source,
          queryMeta: pipeline.meta,
          sourceLabel: formatAssistantQuerySourceLabel(pipeline.source, pipeline.meta),
        }
      }

      if (pipeline.meta.failures.length > 0) {
        pipelineError = pipeline.meta.failures.join('；')
      }
    } catch (error) {
      pipelineError = error instanceof Error ? error.message : 'Dataverse 查询失败。'
    }
  }

  // Only fall back to local snapshot for workbench asks — never for pure weather/chat.
  if ((workbenchAsk || pipelineError) && !generalAsk) {
    const local = answerLocallyFromSnapshot(snapshot, utterance, input.workOrders ?? [])
    if (local) {
      return {
        intent: 'query',
        source: 'local-data',
        sourceLabel: formatAssistantQuerySourceLabel('local-data'),
        reply: [
          local,
          pipelineError
            ? `\n（Dataverse 实时查询失败，已降级为页面缓存：${pipelineError}）`
            : '\n（未匹配到专用实时查询，已降级为页面已加载缓存。）',
        ].join(''),
      }
    }
  }

  if (!hasDeepSeekApiKey()) {
    if (workbenchAsk && !generalAsk) {
      return {
        intent: 'query',
        source: 'local-data',
        sourceLabel: formatAssistantQuerySourceLabel('local-data'),
        reply: [
          `当前已加载工单 ${snapshot.total} 条（未配置 DeepSeek；Dataverse 专用查询未命中或失败）。`,
          pipelineError ? `Dataverse：${pipelineError}` : '',
          `状态：${JSON.stringify(snapshot.byStatus)}`,
          `优先级：${JSON.stringify(snapshot.byPriority)}`,
          `未分派 ${snapshot.unassigned}，逾期 ${snapshot.overdue}，高+紧急 ${snapshot.highOrCritical}。`,
          `空闲员工 ${snapshot.idleEmployees.length} 人。`,
        ].filter(Boolean).join('\n'),
      }
    }
    throw new Error('尚未配置 DeepSeek API Key。请在右下角助手设置中填写。')
  }

  const categoryCatalog = buildCategoryCatalog(input.categories)
  const departmentCatalog = input.departments
    .filter((item) => item.isActive)
    .map((item) => item.departmentName)
    .filter(Boolean)
    .slice(0, 30)
    .join('、')

  const history = (input.history ?? [])
    .slice(-8)
    .map((item) => ({ ...item, content: stripAssistantAttribution(item.content) }))

  const isWorkbenchTopic = workbenchAsk && !generalAsk
  const wantsWeb = generalAsk || (!workbenchAsk && looksLikeWebLookup(utterance))

  let webEvidence = ''
  let citations: AssistantCitation[] = []
  let usedWeb = false
  if (wantsWeb) {
    const gathered = await gatherWebEvidence({ utterance, signal: input.signal })
    webEvidence = gathered.evidence
    citations = gathered.citations
    usedWeb = Boolean(gathered.evidence) && (gathered.usedFetch || gathered.usedSearch)
  }

  const messages: DeepSeekChatMessage[] = [
    {
      role: 'system',
      content: [
        '你是由 DeepSeek 驱动的通用智能助手，同时嵌入在 IT Service Operations Workbench（opsdesk）中。',
        '可以回答各类日常问题（如知识问答、写作、解释、天气常识等），不必把所有话题都扯到工单。',
        '当用户问身份/模型时：说明你基于 DeepSeek，并可用于本工作台的工单助手场景。',
        '仅当问题涉及本工作台业务数据（工单数量、状态、优先级、空闲员工、派单等）时：',
        '- 必须只使用下方【实时工作台快照】中的数据，不要编造业务数字；',
        '- 不要把“查询/统计”理解成创建工单。',
        '若问题与工作台无关：正常按通用助手回答；快照仅作背景，不要主动推销工单功能。',
        usedWeb
          ? '下方提供了联网搜索/网页抓取结果：请优先依据这些材料回答，必要时列出主要来源标题；不要编造检索结果中没有的事实。若材料不足，请明确说明局限。'
          : '关于天气等实时信息：若未提供联网检索结果，请如实说明无法保证实时准确性，并给出一般性建议，不要假装查到了精确实况。',
        '不要在回复末尾添加 “via …” 或模型署名。',
        isWorkbenchTopic ? '【实时工作台快照】' : '【工作台快照（仅在业务相关时参考）】',
        formatWorkspaceSnapshotForPrompt(snapshot),
        isWorkbenchTopic && categoryCatalog ? `（目录）服务类别：${categoryCatalog}` : '',
        isWorkbenchTopic && departmentCatalog ? `（目录）部门：${departmentCatalog}` : '',
        usedWeb ? webEvidence : '',
      ].filter(Boolean).join('\n'),
    },
    ...history,
    { role: 'user', content: utterance },
  ]

  const reply = stripAssistantAttribution(await createDeepSeekChatCompletion({
    messages,
    temperature: isWorkbenchTopic ? 0.2 : usedWeb ? 0.3 : 0.6,
    signal: input.signal,
  }))

  const source = usedWeb ? 'deepseek-web' as const : 'deepseek' as const
  return {
    intent: isQuery ? 'query' : 'chat',
    reply,
    source,
    sourceLabel: formatAssistantQuerySourceLabel(source, null, getDeepSeekModel()),
    citations: usedWeb ? citations : undefined,
  }
}

export type DispatchRecommendation = {
  workOrderId: string
  reply: string
  primary: EmployeeOption | null
  alternatives: EmployeeOption[]
  source: 'local-data' | 'deepseek'
}

function matchEmployeesByNames(names: string[], employees: EmployeeOption[]): EmployeeOption[] {
  const matched: EmployeeOption[] = []
  for (const name of names) {
    const normalized = name.trim().toLocaleLowerCase()
    if (!normalized) continue
    const hit = employees.find((employee) => employee.employeeName.trim().toLocaleLowerCase() === normalized)
      ?? employees.find((employee) => {
        const full = employee.employeeName.trim().toLocaleLowerCase()
        return full.includes(normalized) || normalized.includes(full)
      })
    if (hit && !matched.some((item) => item.id === hit.id)) matched.push(hit)
  }
  return matched
}

function localDispatchCandidates(workOrder: WorkOrder, employees: EmployeeOption[], workOrders: WorkOrder[]) {
  const snapshot = buildWorkspaceSnapshot(workOrders, employees)
  const loads = new Map(snapshot.employees.map((item) => [item.id, item]))
  return employees
    .filter((employee) => employee.isActive && employee.isAvailableForOrder)
    .map((employee) => {
      const load = loads.get(employee.id)
      const currentLoad = load?.currentLoad ?? 0
      const maxTaskLoad = employee.maxTaskLoad ?? null
      const remaining = maxTaskLoad == null ? null : Math.max(0, maxTaskLoad - currentLoad)
      const overloaded = maxTaskLoad != null && currentLoad >= maxTaskLoad
      const sameDepartment = Boolean(workOrder.departmentId && employee.departmentId === workOrder.departmentId)
      const skillHint = (employee.skills ?? '').toLocaleLowerCase()
      const text = `${workOrder.workOrderName} ${workOrder.issueDescription} ${workOrder.serviceCategoryLabel ?? ''}`.toLocaleLowerCase()
      const skillHit = skillHint
        ? skillHint.split(/[,，;；、\s]+/).filter(Boolean).some((token) => text.includes(token))
        : false
      return { employee, currentLoad, maxTaskLoad, remaining, overloaded, sameDepartment, skillHit }
    })
    .filter((item) => !item.overloaded)
    .sort((left, right) => {
      if (left.sameDepartment !== right.sameDepartment) return left.sameDepartment ? -1 : 1
      if (left.skillHit !== right.skillHit) return left.skillHit ? -1 : 1
      const leftRemain = left.remaining ?? 999
      const rightRemain = right.remaining ?? 999
      if (leftRemain !== rightRemain) return rightRemain - leftRemain
      return left.currentLoad - right.currentLoad
    })
}

/** Recommend assignees for a dragged work order. API key helps ranking/rationale; actual assign stays in app. */
export async function recommendDispatchAssignment(input: {
  workOrder: WorkOrder
  employees: EmployeeOption[]
  workOrders: WorkOrder[]
  signal?: AbortSignal
}): Promise<DispatchRecommendation> {
  const candidates = localDispatchCandidates(input.workOrder, input.employees, input.workOrders)
  if (candidates.length === 0) {
    return {
      workOrderId: input.workOrder.id,
      reply: '当前没有可接单且未满负载的员工，无法给出派发建议。请先在资源目录检查员工可接单状态与最大负载。',
      primary: null,
      alternatives: [],
      source: 'local-data',
    }
  }

  const top = candidates.slice(0, 5)
  const localPrimary = top[0]?.employee ?? null
  const localAlternatives = top.slice(1, 4).map((item) => item.employee)
  const localSummary = top.map((item, index) => {
    const capacity = item.maxTaskLoad == null ? `负载 ${item.currentLoad}` : `负载 ${item.currentLoad}/${item.maxTaskLoad}`
    const tags = [
      item.sameDepartment ? '同部门' : null,
      item.skillHit ? '技能匹配' : null,
      item.employee.isAvailableForOrder ? '可接单' : null,
    ].filter(Boolean).join(' / ')
    return `${index + 1}. ${item.employee.employeeName}（${item.employee.department || '未设部门'}，${capacity}${tags ? `，${tags}` : ''}）`
  }).join('\n')

  if (!hasDeepSeekApiKey()) {
    return {
      workOrderId: input.workOrder.id,
      reply: [
        `未配置 DeepSeek 时，按本地负载规则建议：优先 ${localPrimary?.employeeName ?? '无人'}。`,
        '候选：',
        localSummary,
      ].join('\n'),
      primary: localPrimary,
      alternatives: localAlternatives,
      source: 'local-data',
    }
  }

  const content = await createDeepSeekChatCompletion({
    signal: input.signal,
    temperature: 0.2,
    responseFormat: 'json_object',
    messages: [
      {
        role: 'system',
        content: [
          '你是 IT 派单顾问。只能从给定候选人中选择，不要发明不存在的员工。',
          '输出 JSON：primaryName, alternativeNames(字符串数组，最多3个), rationale。',
          '优先考虑：同部门、技能匹配、剩余容量、当前负载更低、可接单。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `工单：${input.workOrder.workOrderNumber || input.workOrder.id}`,
          `标题：${input.workOrder.workOrderName}`,
          `描述：${input.workOrder.issueDescription || '无'}`,
          `部门：${input.workOrder.department || '未指定'}`,
          `类别：${input.workOrder.serviceCategoryLabel || '未分类'}`,
          `优先级：${input.workOrder.priority}`,
          '候选人（已按本地规则预排序）：',
          localSummary,
        ].join('\n'),
      },
    ],
  })

  try {
    const payload = extractJsonObject(content)
    const primaryName = firstText(payload.primaryName, payload.primary, payload.name)
    const alternativeNames = Array.isArray(payload.alternativeNames)
      ? payload.alternativeNames.map(String)
      : splitList(firstText(payload.alternativeNames, payload.alternatives))
    const rationale = firstText(payload.rationale, payload.reason, payload.message) || stripAssistantAttribution(content)
    const primary = matchEmployeesByNames([primaryName], input.employees)[0] ?? localPrimary
    const alternatives = matchEmployeesByNames(alternativeNames, input.employees)
      .filter((item) => item.id !== primary?.id)
      .slice(0, 3)
    const fallbackAlts = alternatives.length > 0
      ? alternatives
      : localAlternatives.filter((item) => item.id !== primary?.id).slice(0, 3)

    return {
      workOrderId: input.workOrder.id,
      reply: [
        `建议将「${input.workOrder.workOrderName}」派给 ${primary?.employeeName ?? '待定'}。`,
        rationale,
        fallbackAlts.length ? `备选：${fallbackAlts.map((item) => item.employeeName).join('、')}` : '',
      ].filter(Boolean).join('\n'),
      primary,
      alternatives: fallbackAlts,
      source: 'deepseek',
    }
  } catch {
    return {
      workOrderId: input.workOrder.id,
      reply: [
        `模型返回无法解析，已回退本地建议：优先 ${localPrimary?.employeeName ?? '无人'}。`,
        localSummary,
      ].join('\n'),
      primary: localPrimary,
      alternatives: localAlternatives,
      source: 'local-data',
    }
  }
}
