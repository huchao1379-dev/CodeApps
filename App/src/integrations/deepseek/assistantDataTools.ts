import {
  loadEmployeeWorkloadsFromDataverse,
  loadWorkOrderDistributionFromDataverse,
  loadWorkOrdersByServerPreset,
  searchWorkOrdersByAssigneeNameFromDataverse,
  searchWorkOrdersFromDataverse,
  type ServerWorkOrderQueryPreset,
} from '../../domains/work-orders/services/dataverseWorkOrderRepository'
import {
  PRIORITY,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type WorkOrder,
} from '../../domains/work-orders/types/workOrder.types'
import { createDeepSeekChatCompletion } from './deepseekClient'

export type AssistantDataToolName =
  | 'preset-work-orders'
  | 'search-work-orders'
  | 'assignee-work-orders'
  | 'work-order-distribution'
  | 'employee-workloads'
  | 'dispatch-fit'
  | 'multi-query'

export type AssistantDataToolResult = {
  tool: AssistantDataToolName
  label: string
  filter?: string
  summary: string
  fetchedAt: string
  orderCount?: number
  sampleOrders?: Array<{
    number: string
    name: string
    status: string
    priority: string
    assignee: string
  }>
  /** When true, the chat layer should ask DeepSeek to compose a multi-part answer. */
  needsSynthesis?: boolean
  parts?: AssistantDataToolResult[]
}

function formatOrderLine(order: WorkOrder): string {
  return `- ${order.workOrderNumber || order.id} ${order.workOrderName}（${STATUS_LABELS[order.status]} / ${PRIORITY_LABELS[order.priority]} / ${order.assignedToName ?? '未分派'}）`
}

function sampleOrders(orders: WorkOrder[], limit = 8) {
  return orders.slice(0, limit).map((order) => ({
    number: order.workOrderNumber || order.id,
    name: order.workOrderName,
    status: STATUS_LABELS[order.status],
    priority: PRIORITY_LABELS[order.priority],
    assignee: order.assignedToName ?? '未分派',
  }))
}

/** Words that look like search terms but are actually count/facet ops — never keyword-search these. */
const KEYWORD_STOPWORDS = /^(多少|几个|数量|总数|统计|逾期|未分派|待分派|紧急|空闲|分布|概况|概览|汇总|全部|列表|有哪些)$/

/** Strip trailing query/facet noise from a captured person name. */
function cleanPersonName(raw: string): string {
  return raw
    .replace(/(?:的)?(?:所有)?(?:工单|数量|多少|几个|有哪些|列表|统计|总数|概况|概览).*$/u, '')
    .replace(/[的了呢吗啊]+$/u, '')
    .trim()
}

/**
 * Extract assignee / 负责人 name from ops questions.
 * e.g. 「负责人为陈可的工单数量」→「陈可」
 */
export function extractAssigneeName(utterance: string): string | null {
  const patterns = [
    // 「负责人为陈可的工单数量」「指派给李四」
    /(?:负责人|指派给|分派给|分配给|指派人|处理人)\s*(?:为|是|：|:)?\s*([A-Za-z0-9\u4e00-\u9fff·•]{2,12}?)(?=的|工单|有|多少|几个|数量|$|[，,。.！!？?\s])/,
    // 「陈可负责的工单」「王五的工单」「赵六有几单」
    /([A-Za-z0-9\u4e00-\u9fff·•]{2,12}?)\s*(?:负责的(?:工单)?|名下(?:的(?:所有)?工单)?|有几[单张个]|的(?:所有)?工单)/,
  ]
  for (const pattern of patterns) {
    const match = utterance.match(pattern)
    if (!match?.[1]) continue
    const name = cleanPersonName(match[1])
    if (
      name.length >= 2
      && !KEYWORD_STOPWORDS.test(name)
      && !/(工单|负责|指派|分派|分配|处理|工程师|员工)/.test(name)
    ) {
      return name
    }
  }
  return null
}

function extractWorkOrderKeyword(utterance: string): string | null {
  // Assignee / count / distribution questions must not become keyword searches
  // (e.g. 「工单数量」 must not extract 「数量」; 「负责人为陈可」 must not extract junk).
  if (extractAssigneeName(utterance) || wantsDistribution(utterance)) return null

  const numbered = utterance.match(/\b(?:WO|IT|WO-|工单)[-\s]?[A-Za-z0-9]{2,}\b/i)
  if (numbered?.[0]) return numbered[0].replace(/^工单/i, '').trim()

  const quoted = utterance.match(/[「『"']([^」』"']{2,40})[」』"']/)
  if (quoted?.[1]) return quoted[1].trim()

  const named = utterance.match(/(?:工单|查找|查询|搜)\s*([A-Za-z0-9\u4e00-\u9fff\-_]{2,40})/)
  if (named?.[1] && !KEYWORD_STOPWORDS.test(named[1].trim())) {
    return named[1].trim()
  }
  return null
}

function matchPreset(utterance: string): ServerWorkOrderQueryPreset | null {
  // Do not steal assignee-scoped questions into generic presets.
  if (extractAssigneeName(utterance)) return null
  if (/(逾期)/i.test(utterance)) return 'active-overdue'
  if (/(未分派|待分派|待分配)/i.test(utterance)) return 'unassigned-new'
  if (/(紧急)/i.test(utterance) && /(工单|未关闭|打开|open|有哪些|多少|几个|列表)/i.test(utterance)) {
    return 'critical-open'
  }
  if (/(高优先|高优先级|紧急).*(处理中)|(处理中).*(高优先|高优先级|紧急)/i.test(utterance)) {
    return 'high-priority-in-progress'
  }
  if (/(高优先|高优先级).*(工单|有哪些|多少|几个|列表)/i.test(utterance)) {
    return 'high-priority-in-progress'
  }
  return null
}

function wantsDistribution(utterance: string): boolean {
  // 「负责人为陈可的工单数量」is assignee-scoped, not a global distribution.
  if (extractAssigneeName(utterance)) return false
  return /(状态分布|优先级分布|概况|概览|汇总|总数|全部工单|工单数量|工单总数|多少(?:个|张)?工单|工单(?:有)?多少|有多少工单|统计)/i.test(utterance)
}

function wantsIdleOrLoad(utterance: string): boolean {
  // 「陈可的工单数量」must not fall into workload tools.
  if (extractAssigneeName(utterance) && !/(空闲|可接单|有空|负载|工作量|忙不忙)/i.test(utterance)) {
    return false
  }
  return /(空闲|可接单|有空|空着的员工|谁可以派|负载|工作量)/i.test(utterance)
}

function wantsWorkbenchData(utterance: string): boolean {
  return /(工单|派单|待派单|代派单|员工|负载|逾期|未分派|待分派|紧急|空闲|可接单|状态分布|优先级|SLA|负责人|指派给|分派给|适合|适配|推荐)/i.test(utterance)
}

async function runPresetQuery(preset: ServerWorkOrderQueryPreset): Promise<AssistantDataToolResult> {
  const result = await loadWorkOrdersByServerPreset(preset)
  const lines = [
    `Dataverse 实时查询「${result.label}」共 ${result.orders.length} 条。`,
    result.orders.length > 0 ? '样例：' : '当前没有匹配工单。',
    ...result.orders.slice(0, 8).map(formatOrderLine),
    result.orders.length > 8 ? `……另有 ${result.orders.length - 8} 条未列出。` : '',
  ].filter(Boolean)
  return {
    tool: 'preset-work-orders',
    label: result.label,
    filter: result.filter,
    summary: lines.join('\n'),
    fetchedAt: new Date().toISOString(),
    orderCount: result.orders.length,
    sampleOrders: sampleOrders(result.orders),
  }
}

async function runSearchQuery(keyword: string): Promise<AssistantDataToolResult> {
  const result = await searchWorkOrdersFromDataverse(keyword, 20)
  const lines = [
    `Dataverse 关键词搜索「${keyword}」命中 ${result.orders.length} 条。`,
    result.orders.length > 0 ? '结果：' : '没有找到匹配工单。',
    ...result.orders.slice(0, 10).map(formatOrderLine),
  ].filter(Boolean)
  return {
    tool: 'search-work-orders',
    label: `关键词搜索：${keyword}`,
    filter: result.filter,
    summary: lines.join('\n'),
    fetchedAt: new Date().toISOString(),
    orderCount: result.orders.length,
    sampleOrders: sampleOrders(result.orders, 10),
  }
}

async function runDistributionQuery(): Promise<AssistantDataToolResult> {
  const stats = await loadWorkOrderDistributionFromDataverse()
  const summary = [
    `Dataverse 实时统计（全库 statecode=0）。`,
    `工单总数：${stats.total}`,
    `状态分布：${JSON.stringify(stats.byStatus)}`,
    `优先级分布：${JSON.stringify(stats.byPriority)}`,
    `未分派：${stats.unassigned}`,
    `逾期（活跃）：${stats.overdue}`,
    `高+紧急（未关闭）：${stats.highOrCritical}`,
  ].join('\n')
  return {
    tool: 'work-order-distribution',
    label: '工单分布统计',
    filter: stats.filters.join(' | '),
    summary,
    fetchedAt: new Date().toISOString(),
    orderCount: stats.total,
  }
}

async function runAssigneeQuery(assigneeName: string): Promise<AssistantDataToolResult> {
  const result = await searchWorkOrdersByAssigneeNameFromDataverse(assigneeName, 20)
  if (result.matchedEmployees.length === 0) {
    return {
      tool: 'assignee-work-orders',
      label: `负责人：${assigneeName}`,
      filter: result.employeeFilter,
      summary: `Dataverse 未找到姓名包含「${assigneeName}」的员工，无法按负责人筛选工单。`,
      fetchedAt: new Date().toISOString(),
      orderCount: 0,
    }
  }

  const employeeLabel = result.matchedEmployees.map((item) => item.name).join('、')
  const lines = [
    `Dataverse 按负责人「${assigneeName}」实时查询：匹配员工 ${result.matchedEmployees.length} 人（${employeeLabel}），工单共 ${result.total} 条。`,
    result.orders.length > 0 ? '样例：' : '当前没有匹配工单。',
    ...result.orders.slice(0, 10).map(formatOrderLine),
    result.total > result.orders.length
      ? `……另有 ${result.total - result.orders.length} 条未列出。`
      : '',
  ].filter(Boolean)

  return {
    tool: 'assignee-work-orders',
    label: `负责人：${employeeLabel}`,
    filter: result.filter,
    summary: lines.join('\n'),
    fetchedAt: new Date().toISOString(),
    orderCount: result.total,
    sampleOrders: sampleOrders(result.orders, 10),
  }
}

async function runDispatchFitQuery(employeeName: string): Promise<AssistantDataToolResult> {
  const needle = employeeName.trim()
  const [unassigned, workloads] = await Promise.all([
    loadWorkOrdersByServerPreset('unassigned-new'),
    loadEmployeeWorkloadsFromDataverse(),
  ])

  const matchedEmployees = workloads.rows.filter((row) => {
    const name = row.employee.employeeName.toLocaleLowerCase()
    const hint = needle.toLocaleLowerCase()
    return name.includes(hint) || hint.includes(name)
  })

  if (matchedEmployees.length === 0) {
    return {
      tool: 'dispatch-fit',
      label: `派单适配：${needle}`,
      filter: unassigned.filter,
      summary: `未找到员工「${needle}」，无法评估待派单适配度。待派单池仍有 ${unassigned.orders.length} 条。`,
      fetchedAt: new Date().toISOString(),
      orderCount: unassigned.orders.length,
    }
  }

  const target = matchedEmployees[0]
  const employee = target.employee
  if (!employee.isAvailableForOrder) {
    return {
      tool: 'dispatch-fit',
      label: `派单适配：${employee.employeeName}`,
      filter: unassigned.filter,
      summary: [
        `员工「${employee.employeeName}」当前不可接单，不建议分配新单。`,
        `待派单池 ${unassigned.orders.length} 条；其当前负载 ${target.currentLoad}${employee.maxTaskLoad == null ? '' : `/${employee.maxTaskLoad}`}。`,
      ].join('\n'),
      fetchedAt: new Date().toISOString(),
      orderCount: unassigned.orders.length,
    }
  }

  if (employee.maxTaskLoad != null && target.currentLoad >= employee.maxTaskLoad) {
    return {
      tool: 'dispatch-fit',
      label: `派单适配：${employee.employeeName}`,
      filter: unassigned.filter,
      summary: [
        `员工「${employee.employeeName}」已满负载（${target.currentLoad}/${employee.maxTaskLoad}），暂不建议再派。`,
        `待派单池 ${unassigned.orders.length} 条。`,
      ].join('\n'),
      fetchedAt: new Date().toISOString(),
      orderCount: unassigned.orders.length,
    }
  }

  const skillTokens = (employee.skills ?? '')
    .toLocaleLowerCase()
    .split(/[,，;；、\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  const ranked = unassigned.orders
    .map((order) => {
      const text = `${order.workOrderName} ${order.issueDescription} ${order.serviceCategoryLabel ?? ''}`.toLocaleLowerCase()
      const sameDepartment = Boolean(employee.departmentId && order.departmentId === employee.departmentId)
      const skillHit = skillTokens.length > 0 && skillTokens.some((token) => text.includes(token))
      const priorityBoost = order.priority === PRIORITY.critical
        ? 2
        : order.priority === PRIORITY.high
          ? 1
          : 0
      const score = (sameDepartment ? 4 : 0) + (skillHit ? 3 : 0) + priorityBoost
      return { order, sameDepartment, skillHit, score }
    })
    .sort((left, right) => right.score - left.score || right.order.priority - left.order.priority)

  const suitable = ranked.filter((item) => item.score > 0).slice(0, 8)
  const show = suitable.length > 0 ? suitable : ranked.slice(0, 5)
  const capacity = employee.maxTaskLoad == null
    ? `负载 ${target.currentLoad}`
    : `负载 ${target.currentLoad}/${employee.maxTaskLoad}`

  const lines = [
    `待派单池 ${unassigned.orders.length} 条；评估适配给「${employee.employeeName}」（${employee.department ?? '未设部门'}，${capacity}${skillTokens.length ? `，技能：${employee.skills}` : ''}）。`,
    suitable.length > 0
      ? `较适合的待派单 ${suitable.length} 条（按同部门/技能/优先级排序）：`
      : '未命中明确技能/部门匹配，以下为待派单优先级较高样例：',
    ...show.map((item) => {
      const tags = [
        item.sameDepartment ? '同部门' : null,
        item.skillHit ? '技能匹配' : null,
      ].filter(Boolean).join(' / ')
      return `${formatOrderLine(item.order)}${tags ? ` 【${tags}】` : ''}`
    }),
  ]

  return {
    tool: 'dispatch-fit',
    label: `派单适配：${employee.employeeName}`,
    filter: unassigned.filter,
    summary: lines.join('\n'),
    fetchedAt: new Date().toISOString(),
    orderCount: unassigned.orders.length,
    sampleOrders: sampleOrders(show.map((item) => item.order), 8),
  }
}

async function runEmployeeWorkloadQuery(
  utterance: string,
  planned?: { employeeName?: string | null; wantIdle?: boolean },
): Promise<AssistantDataToolResult> {
  const result = await loadEmployeeWorkloadsFromDataverse()
  const nameHint = planned?.employeeName?.trim()
    || utterance.match(/(?:员工|工程师|看看|查询)\s*([A-Za-z0-9\u4e00-\u9fff]{2,20})/)?.[1]
    || utterance.match(/([A-Za-z0-9\u4e00-\u9fff]{2,20})\s*(?:的负载|忙不忙|有几单)/)?.[1]
    || null

  if (nameHint && !/(空闲|可接单|负载|工作量|员工|工程师)/.test(nameHint)) {
    const matched = result.rows.filter((row) => {
      const name = row.employee.employeeName.toLocaleLowerCase()
      const hint = nameHint.toLocaleLowerCase()
      return name.includes(hint) || hint.includes(name)
    })
    if (matched.length > 0) {
      const lines = matched.slice(0, 8).map((row) => {
        const capacity = row.employee.maxTaskLoad == null
          ? `负载 ${row.currentLoad}`
          : `负载 ${row.currentLoad}/${row.employee.maxTaskLoad}`
        return `- ${row.employee.employeeName}（${row.employee.department ?? '未设部门'}，${capacity}${row.idle ? '，空闲' : ''}）`
      })
      return {
        tool: 'employee-workloads',
        label: `员工负载：${nameHint}`,
        filter: result.filter,
        summary: [`Dataverse 实时员工负载（匹配「${nameHint}」）：`, ...lines].join('\n'),
        fetchedAt: new Date().toISOString(),
      }
    }
  }

  if (planned?.wantIdle || /(空闲|可接单|有空|谁可以派)/i.test(utterance)) {
    const lines = result.idle.length === 0
      ? ['按实时负载规则，当前没有可判定为空闲的员工。']
      : [
        `当前空闲/可接单员工 ${result.idle.length} 人（Dataverse 实时）：`,
        ...result.idle.slice(0, 12).map((row) => {
          const capacity = row.employee.maxTaskLoad == null
            ? `负载 ${row.currentLoad}`
            : `负载 ${row.currentLoad}/${row.employee.maxTaskLoad}`
          return `- ${row.employee.employeeName}（${row.employee.department ?? '未设部门'}，${capacity}）`
        }),
      ]
    return {
      tool: 'employee-workloads',
      label: '空闲/可接单员工',
      filter: result.filter,
      summary: lines.join('\n'),
      fetchedAt: new Date().toISOString(),
    }
  }

  const topBusy = [...result.rows]
    .sort((left, right) => right.currentLoad - left.currentLoad)
    .slice(0, 10)
  const lines = [
    `Dataverse 实时员工负载：在岗 ${result.rows.length} 人，空闲 ${result.idle.length} 人。`,
    '负载较高样例：',
    ...topBusy.map((row) => {
      const capacity = row.employee.maxTaskLoad == null
        ? `负载 ${row.currentLoad}`
        : `负载 ${row.currentLoad}/${row.employee.maxTaskLoad}`
      return `- ${row.employee.employeeName}（${row.employee.department ?? '未设部门'}，${capacity}${row.idle ? '，空闲' : ''}）`
    }),
  ]
  return {
    tool: 'employee-workloads',
    label: '员工负载概览',
    filter: result.filter,
    summary: lines.join('\n'),
    fetchedAt: new Date().toISOString(),
  }
}

export type AssistantDataPlanIntent =
  | 'none'
  | 'distribution'
  | 'preset'
  | 'assignee'
  | 'keyword'
  | 'employee_workload'
  | 'dispatch_fit'

export type AssistantDataPlan = {
  intent: AssistantDataPlanIntent
  preset?: ServerWorkOrderQueryPreset | null
  assigneeName?: string | null
  keyword?: string | null
  employeeName?: string | null
  wantIdle?: boolean
}

export type AssistantDataPlanBundle = {
  steps: AssistantDataPlan[]
  needsSynthesis: boolean
}

const PRESET_VALUES = new Set<ServerWorkOrderQueryPreset>([
  'active-overdue',
  'critical-open',
  'unassigned-new',
  'high-priority-in-progress',
])

function parsePlanJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    }
    throw new Error('查询规划返回不是有效 JSON。')
  }
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : null
}

function normalizeAssistantDataPlan(payload: Record<string, unknown>): AssistantDataPlan {
  const intentRaw = String(payload.intent ?? 'none').trim().toLocaleLowerCase()
  const intent = (
    intentRaw === 'distribution'
    || intentRaw === 'preset'
    || intentRaw === 'assignee'
    || intentRaw === 'keyword'
    || intentRaw === 'employee_workload'
    || intentRaw === 'dispatch_fit'
      ? intentRaw
      : 'none'
  ) as AssistantDataPlanIntent

  const presetRaw = String(payload.preset ?? '').trim() as ServerWorkOrderQueryPreset
  const preset = PRESET_VALUES.has(presetRaw) ? presetRaw : null

  return {
    intent,
    preset,
    assigneeName: asOptionalString(payload.assigneeName ?? payload.assignee ?? payload.owner),
    keyword: asOptionalString(payload.keyword ?? payload.search),
    employeeName: asOptionalString(payload.employeeName ?? payload.employee),
    wantIdle: Boolean(payload.wantIdle ?? payload.idle),
  }
}

function planStepKey(plan: AssistantDataPlan): string {
  return [
    plan.intent,
    plan.preset ?? '',
    plan.assigneeName ?? '',
    plan.keyword ?? '',
    plan.employeeName ?? '',
    plan.wantIdle ? '1' : '0',
  ].join('|')
}

function normalizeAssistantDataPlanBundle(payload: Record<string, unknown>): AssistantDataPlanBundle {
  const rawSteps = Array.isArray(payload.steps)
    ? payload.steps
    : payload.intent
      ? [payload]
      : []

  const steps: AssistantDataPlan[] = []
  const seen = new Set<string>()
  for (const item of rawSteps.slice(0, 4)) {
    if (!item || typeof item !== 'object') continue
    const plan = normalizeAssistantDataPlan(item as Record<string, unknown>)
    if (plan.intent === 'none') continue
    const key = planStepKey(plan)
    if (seen.has(key)) continue
    seen.add(key)
    steps.push(plan)
  }

  return {
    steps,
    needsSynthesis: Boolean(payload.needsSynthesis) || steps.length > 1,
  }
}

/**
 * Ask DeepSeek to map a natural-language question to one or more whitelist Dataverse tool plans.
 * The model only returns structured fields — it never writes raw OData $filter.
 */
export async function planAssistantDataQueryWithDeepSeek(
  utterance: string,
  signal?: AbortSignal,
): Promise<AssistantDataPlanBundle> {
  const content = await createDeepSeekChatCompletion({
    signal,
    temperature: 0,
    responseFormat: 'json_object',
    messages: [
      {
        role: 'system',
        content: [
          '你是 IT 运维工作台的查询规划器。把用户问题拆成 1~4 个 Dataverse 白名单查询步骤。',
          '只输出 JSON 对象，不要 markdown，不要解释。',
          '输出：{"steps":[...],"needsSynthesis":boolean}',
          '每个 step 字段：',
          '- intent: none | distribution | preset | assignee | keyword | employee_workload | dispatch_fit',
          '- preset: active-overdue | critical-open | unassigned-new | high-priority-in-progress | null',
          '- assigneeName: 负责人姓名或 null',
          '- keyword: 工单号/标题关键词或 null（不要把“数量/多少/统计/概况/待派单”当 keyword）',
          '- employeeName: 员工姓名或 null（负载或派单适配）',
          '- wantIdle: boolean',
          '规则：',
          '1. 复合问题必须拆成多个 steps，不要只保留第一句。',
          '2. 某人的工单/数量 → assignee（assigneeName）。',
          '3. 待派单/代派单/未分派有哪些 → preset=unassigned-new。',
          '4. 哪些适合给某人/推荐派给某人 → dispatch_fit（employeeName=该人）。',
          '5. 全局总数/概况/分布且无负责人 → distribution。',
          '6. 逾期/紧急打开/高优先级处理中 → 对应 preset。',
          '7. 空闲/可接单/负载 → employee_workload。',
          '8. 按工单号或标题查找 → keyword。',
          '9. 与工单/员工无关 → steps=[]。',
          '10. 只要步骤≥2，或需要归纳建议/适配，needsSynthesis=true。',
          '示例：',
          '「工单数量」→ {"steps":[{"intent":"distribution","preset":null,"assigneeName":null,"keyword":null,"employeeName":null,"wantIdle":false}],"needsSynthesis":false}',
          '「负责人为陈可的工单数量」→ {"steps":[{"intent":"assignee","preset":null,"assigneeName":"陈可","keyword":null,"employeeName":null,"wantIdle":false}],"needsSynthesis":false}',
          '「陈可的工单数量，并且待派单有哪些，哪些适合给陈可？」→ {"steps":[{"intent":"assignee","assigneeName":"陈可","preset":null,"keyword":null,"employeeName":null,"wantIdle":false},{"intent":"preset","preset":"unassigned-new","assigneeName":null,"keyword":null,"employeeName":null,"wantIdle":false},{"intent":"dispatch_fit","employeeName":"陈可","preset":null,"assigneeName":null,"keyword":null,"wantIdle":false}],"needsSynthesis":true}',
        ].join('\n'),
      },
      { role: 'user', content: utterance },
    ],
  })
  return normalizeAssistantDataPlanBundle(parsePlanJson(content))
}

/** Execute one whitelist Dataverse read-only tool. */
export async function executeAssistantDataPlan(
  plan: AssistantDataPlan,
  utterance: string,
): Promise<AssistantDataToolResult | null> {
  switch (plan.intent) {
    case 'assignee':
      if (!plan.assigneeName) return null
      return runAssigneeQuery(plan.assigneeName)
    case 'preset':
      if (!plan.preset) return null
      return runPresetQuery(plan.preset)
    case 'distribution':
      return runDistributionQuery()
    case 'keyword':
      if (!plan.keyword || KEYWORD_STOPWORDS.test(plan.keyword)) return null
      return runSearchQuery(plan.keyword)
    case 'employee_workload':
      return runEmployeeWorkloadQuery(utterance, {
        employeeName: plan.employeeName,
        wantIdle: plan.wantIdle,
      })
    case 'dispatch_fit': {
      const name = plan.employeeName || plan.assigneeName
      if (!name) return null
      return runDispatchFitQuery(name)
    }
    default:
      return null
  }
}

function emptyStep(partial: Partial<AssistantDataPlan> & Pick<AssistantDataPlan, 'intent'>): AssistantDataPlan {
  return {
    intent: partial.intent,
    preset: partial.preset ?? null,
    assigneeName: partial.assigneeName ?? null,
    keyword: partial.keyword ?? null,
    employeeName: partial.employeeName ?? null,
    wantIdle: partial.wantIdle ?? false,
  }
}

function extractFitEmployeeName(utterance: string): string | null {
  return extractAssigneeName(utterance)
    || asOptionalString(utterance.match(/(?:适合|适配|推荐)(?:给|派给)?\s*([A-Za-z0-9\u4e00-\u9fff·•]{2,12})/)?.[1] ?? null)
    || asOptionalString(utterance.match(/给\s*([A-Za-z0-9\u4e00-\u9fff·•]{2,12})\s*(?:派|接|处理)?/)?.[1] ?? null)
}

/**
 * Offline / no-Key planner: returns structured steps only.
 * Execution always goes through the unified query pipeline.
 */
export function planAssistantDataQueryHeuristic(utterance: string): AssistantDataPlanBundle {
  const text = utterance.trim()
  if (!text || !wantsWorkbenchData(text)) return { steps: [], needsSynthesis: false }

  const fitName = extractFitEmployeeName(text)
  const wantsFit = /(适合|适配|推荐派|可以派给)/i.test(text)
  const wantsUnassigned = /(待派单|代派单|未分派|待分派)/i.test(text)
  const wantsAssigneeCount = Boolean(fitName) && /(工单数量|有几|多少|名下|负责|的工单)/i.test(text)

  const steps: AssistantDataPlan[] = []
  if (wantsAssigneeCount && fitName) {
    steps.push(emptyStep({ intent: 'assignee', assigneeName: fitName }))
  }
  if (wantsFit && fitName) {
    steps.push(emptyStep({ intent: 'dispatch_fit', employeeName: fitName }))
  } else if (wantsUnassigned) {
    steps.push(emptyStep({ intent: 'preset', preset: 'unassigned-new' }))
  }
  if (steps.length > 0) {
    return { steps, needsSynthesis: steps.length > 1 || wantsFit }
  }

  const assigneeName = extractAssigneeName(text)
  if (assigneeName) {
    return { steps: [emptyStep({ intent: 'assignee', assigneeName })], needsSynthesis: false }
  }

  const preset = matchPreset(text)
  if (preset) {
    return { steps: [emptyStep({ intent: 'preset', preset })], needsSynthesis: false }
  }

  if (wantsIdleOrLoad(text)) {
    return {
      steps: [emptyStep({
        intent: 'employee_workload',
        wantIdle: /(空闲|可接单|有空|谁可以派)/i.test(text),
      })],
      needsSynthesis: false,
    }
  }

  if (wantsDistribution(text) || /(查询|有哪些|列表).*(工单)|(工单).*(查询|有哪些|列表)/i.test(text)) {
    return { steps: [emptyStep({ intent: 'distribution' })], needsSynthesis: false }
  }

  const keyword = extractWorkOrderKeyword(text)
  if (keyword) {
    return { steps: [emptyStep({ intent: 'keyword', keyword })], needsSynthesis: false }
  }

  return { steps: [], needsSynthesis: false }
}

export function formatAssistantDataToolForPrompt(result: AssistantDataToolResult): string {
  if (result.parts && result.parts.length > 1) {
    return [
      `【Dataverse 多步实时查询】${result.label}`,
      `查询时间：${result.fetchedAt}`,
      ...result.parts.map((part, index) => [
        `--- 步骤 ${index + 1}: ${part.label} ---`,
        part.filter ? `filter：${part.filter}` : '',
        part.summary,
      ].filter(Boolean).join('\n')),
    ].join('\n')
  }

  return [
    `【Dataverse 实时查询】${result.label}`,
    `查询时间：${result.fetchedAt}`,
    result.filter ? `filter：${result.filter}` : '',
    result.summary,
  ].filter(Boolean).join('\n')
}
