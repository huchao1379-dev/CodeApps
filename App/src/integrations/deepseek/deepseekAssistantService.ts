import {
  buildCategoryCatalog,
  resolveAiDraftAgainstCatalog,
  type AiWorkOrderDraft,
} from '../power-automate/aiWorkOrderDraftAdapter'
import {
  PRIORITY,
  type DepartmentOption,
  type EmployeeOption,
  type Priority,
  type ServiceCategoryOption,
  type WorkOrder,
} from '../../domains/work-orders/types/workOrder.types'
import { createDeepSeekChatCompletion, type DeepSeekChatMessage } from './deepseekClient'
import { hasDeepSeekApiKey } from './deepseekConfig'
import { buildWorkspaceSnapshot, formatWorkspaceSnapshotForPrompt } from './workspaceSnapshot'

export type AssistantIntent = 'chat' | 'create_work_order' | 'query'

export type AssistantReply = {
  intent: AssistantIntent
  reply: string
  draft?: AiWorkOrderDraft
  /** Where the answer came from; UI should show this once. */
  source: 'local-data' | 'deepseek'
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

/** 明确查询/统计意图，绝不能走建单。 */
export function looksLikeDataQuery(text: string): boolean {
  return /(查询|查一下|统计|多少|几个|数量|有哪些|列表|概况|概览|汇总|占比|分布|当前.*工单|工单.*(多少|数量|几个)|高优先级|紧急工单|未分派|逾期|空闲|可接单|谁可以派)/i.test(text)
}

/** 明确建单意图。 */
export function looksLikeCreateRequest(text: string): boolean {
  if (looksLikeDataQuery(text)) return false
  return /(建单|创建工单|新建工单|帮我创建|提交工单|报修|帮忙处理一下故障|登记工单)/i.test(text)
    || (/(故障|蓝屏|无法开机|开不了机|连不上网|打印机坏了)/i.test(text) && !/(查询|多少|统计)/i.test(text))
}

function answerLocallyFromSnapshot(snapshot: ReturnType<typeof buildWorkspaceSnapshot>, utterance: string): string | null {
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

  if (/(总数|全部工单|工单数量|多少工单)/i.test(utterance)) {
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
  signal?: AbortSignal
}): Promise<AssistantReply> {
  const utterance = input.utterance.trim()
  if (!utterance) throw new Error('请输入内容。')

  const snapshot = buildWorkspaceSnapshot(input.workOrders ?? [], input.employees ?? [])
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
    if (!draft.serviceCategoryId) missing.push('服务类别')
    if (!draft.departmentId) missing.push('负责部门')
    return {
      intent: 'create_work_order',
      reply: missing.length
        ? `已生成工单草稿，但还需确认：${missing.join('、')}。请在下方卡片中补全后创建。`
        : `已生成工单草稿（置信度 ${draft.confidence == null ? '未知' : `${Math.round(draft.confidence * 100)}%`}）。确认后可直接创建。`,
      draft,
      source: 'deepseek',
    }
  }

  // Prefer exact local stats for common operational questions.
  const local = answerLocallyFromSnapshot(snapshot, utterance)
  if (local) {
    return { intent: 'query', reply: local, source: 'local-data' }
  }

  if (!hasDeepSeekApiKey()) {
    if (isQuery) {
      return {
        intent: 'query',
        source: 'local-data',
        reply: [
          `当前已加载工单 ${snapshot.total} 条（未配置 DeepSeek 时仅提供基础统计）。`,
          `状态：${JSON.stringify(snapshot.byStatus)}`,
          `优先级：${JSON.stringify(snapshot.byPriority)}`,
          `未分派 ${snapshot.unassigned}，逾期 ${snapshot.overdue}，高+紧急 ${snapshot.highOrCritical}。`,
          `空闲员工 ${snapshot.idleEmployees.length} 人。`,
          '如需自然语言复杂分析，请先在助手设置中配置 DeepSeek API Key。',
        ].join('\n'),
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

  const isWorkbenchTopic = isQuery || /(工单|派单|库存|审批|员工|负载|SLA|运维|opsdesk)/i.test(utterance)

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
        '关于天气等实时信息：若你没有实时联网检索能力，请如实说明，并给出一般性建议或用户可自查的方式，不要假装查到了精确实况。',
        '不要在回复末尾添加 “via …” 或模型署名。',
        isWorkbenchTopic ? '【实时工作台快照】' : '【工作台快照（仅在业务相关时参考）】',
        formatWorkspaceSnapshotForPrompt(snapshot),
        isWorkbenchTopic && categoryCatalog ? `（目录）服务类别：${categoryCatalog}` : '',
        isWorkbenchTopic && departmentCatalog ? `（目录）部门：${departmentCatalog}` : '',
      ].filter(Boolean).join('\n'),
    },
    ...history,
    { role: 'user', content: utterance },
  ]

  const reply = stripAssistantAttribution(await createDeepSeekChatCompletion({
    messages,
    temperature: isWorkbenchTopic ? 0.2 : 0.6,
    signal: input.signal,
  }))

  return { intent: isQuery ? 'query' : 'chat', reply, source: 'deepseek' }
}
