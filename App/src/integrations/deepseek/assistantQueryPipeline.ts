import { createDeepSeekChatCompletion } from './deepseekClient'
import { hasDeepSeekApiKey } from './deepseekConfig'
import {
  executeAssistantDataPlan,
  formatAssistantDataToolForPrompt,
  planAssistantDataQueryHeuristic,
  planAssistantDataQueryWithDeepSeek,
  type AssistantDataPlan,
  type AssistantDataPlanBundle,
  type AssistantDataPlanIntent,
  type AssistantDataToolResult,
} from './assistantDataTools'
import type { ServerWorkOrderQueryPreset } from '../../domains/work-orders/services/dataverseWorkOrderRepository'

const PRESET_VALUES = new Set<ServerWorkOrderQueryPreset>([
  'active-overdue',
  'critical-open',
  'unassigned-new',
  'high-priority-in-progress',
])

const MAX_STEPS = 4
const ODATA_INJECTION = /(eq\s|ne\s|contains\s*\(|\$filter|\$select|\$expand|--|\/\*|\*\/|;)/i

export type AssistantQueryPermissions = {
  canQueryWorkOrders: boolean
  canQueryEmployees: boolean
  canViewDispatchAdvice: boolean
  /** App RBAC for creating work orders after human confirmation (AI never writes directly). */
  canCreateWorkOrder?: boolean
  /** App RBAC for editing resources (e.g. employee 接单状态) after human confirmation. */
  canEditResources?: boolean
}

export type AssistantQuerySource =
  | 'dataverse'
  | 'dataverse+deepseek'
  | 'local-data'
  | 'deepseek'
  | 'deepseek-web'

export type ValidatedPlanStep = {
  plan: AssistantDataPlan
  accepted: boolean
  rejectReason?: string
}

export type QueryStepExecution = {
  plan: AssistantDataPlan
  status: 'success' | 'failed' | 'skipped'
  durationMs: number
  fetchedAt: string
  errorMessage?: string
  result?: AssistantDataToolResult
}

export type AssistantQueryMeta = {
  plannedBy: 'deepseek' | 'heuristic' | 'none'
  presentation: 'direct' | 'synthesized' | 'none'
  stepCount: number
  successCount: number
  failedCount: number
  skippedCount: number
  durationMs: number
  fetchedAt: string
  failures: string[]
  rejectedSteps: string[]
}

export type AssistantQueryPipelineResult = {
  hit: boolean
  reply: string
  source: Extract<AssistantQuerySource, 'dataverse' | 'dataverse+deepseek'>
  evidence: AssistantDataToolResult | null
  meta: AssistantQueryMeta
  plan: AssistantDataPlanBundle
  validatedSteps: ValidatedPlanStep[]
  executions: QueryStepExecution[]
}

function nowIso() {
  return new Date().toISOString()
}

function safeName(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().slice(0, 40)
  if (!trimmed || ODATA_INJECTION.test(trimmed)) return null
  return trimmed
}

function intentNeedsWorkOrders(intent: AssistantDataPlanIntent): boolean {
  return intent === 'distribution'
    || intent === 'preset'
    || intent === 'assignee'
    || intent === 'keyword'
    || intent === 'dispatch_fit'
}

function intentNeedsEmployees(intent: AssistantDataPlanIntent): boolean {
  return intent === 'employee_workload' || intent === 'dispatch_fit' || intent === 'assignee'
}

/**
 * App-side validation: whitelist intent, required fields, permissions, and query scope.
 */
export function validateAssistantDataPlanBundle(
  bundle: AssistantDataPlanBundle,
  permissions: AssistantQueryPermissions,
): { validatedSteps: ValidatedPlanStep[]; acceptedPlans: AssistantDataPlan[]; rejectedSteps: string[] } {
  const validatedSteps: ValidatedPlanStep[] = []
  const acceptedPlans: AssistantDataPlan[] = []
  const rejectedSteps: string[] = []
  const seen = new Set<string>()

  for (const raw of bundle.steps.slice(0, MAX_STEPS)) {
    const plan: AssistantDataPlan = {
      ...raw,
      assigneeName: safeName(raw.assigneeName),
      keyword: safeName(raw.keyword),
      employeeName: safeName(raw.employeeName),
      preset: raw.preset && PRESET_VALUES.has(raw.preset) ? raw.preset : null,
    }

    let rejectReason: string | undefined
    if (plan.intent === 'none') rejectReason = '空意图'
    else if (intentNeedsWorkOrders(plan.intent) && !permissions.canQueryWorkOrders) rejectReason = '无工单查询权限'
    else if (intentNeedsEmployees(plan.intent) && !permissions.canQueryEmployees) rejectReason = '无员工查询权限'
    else if (plan.intent === 'dispatch_fit' && !permissions.canViewDispatchAdvice) rejectReason = '无派单建议查看权限'
    else if (plan.intent === 'assignee' && !plan.assigneeName) rejectReason = '负责人姓名缺失或非法'
    else if (plan.intent === 'preset' && !plan.preset) rejectReason = '预设筛选不在白名单'
    else if (plan.intent === 'keyword' && !plan.keyword) rejectReason = '关键词缺失或非法'
    else if (plan.intent === 'dispatch_fit' && !(plan.employeeName || plan.assigneeName)) {
      rejectReason = '派单适配缺少员工姓名'
    }

    const key = [
      plan.intent,
      plan.preset ?? '',
      plan.assigneeName ?? '',
      plan.keyword ?? '',
      plan.employeeName ?? '',
      plan.wantIdle ? '1' : '0',
    ].join('|')
    if (!rejectReason && seen.has(key)) rejectReason = '重复步骤'
    if (!rejectReason) seen.add(key)

    const accepted = !rejectReason
    validatedSteps.push({ plan, accepted, rejectReason })
    if (accepted) acceptedPlans.push(plan)
    else if (rejectReason) rejectedSteps.push(`${plan.intent}: ${rejectReason}`)
  }

  return { validatedSteps, acceptedPlans, rejectedSteps }
}

async function executeValidatedSteps(
  plans: AssistantDataPlan[],
  utterance: string,
): Promise<QueryStepExecution[]> {
  return Promise.all(plans.map(async (plan) => {
    const started = performance.now()
    const fetchedAt = nowIso()
    try {
      const result = await executeAssistantDataPlan(plan, utterance)
      const durationMs = Math.round(performance.now() - started)
      if (!result) {
        return {
          plan,
          status: 'skipped' as const,
          durationMs,
          fetchedAt,
          errorMessage: '步骤未产生结果',
        }
      }
      return {
        plan,
        status: 'success' as const,
        durationMs,
        fetchedAt: result.fetchedAt || fetchedAt,
        result: { ...result, fetchedAt: result.fetchedAt || fetchedAt },
      }
    } catch (error) {
      return {
        plan,
        status: 'failed' as const,
        durationMs: Math.round(performance.now() - started),
        fetchedAt,
        errorMessage: error instanceof Error ? error.message : 'Dataverse 查询失败',
      }
    }
  }))
}

function mergeEvidence(
  executions: QueryStepExecution[],
  needsSynthesis: boolean,
): AssistantDataToolResult | null {
  const parts = executions
    .filter((item) => item.status === 'success' && item.result)
    .map((item) => item.result!)

  if (parts.length === 0) return null
  if (parts.length === 1) {
    return { ...parts[0], needsSynthesis: needsSynthesis || Boolean(parts[0].needsSynthesis) }
  }

  return {
    tool: 'multi-query',
    label: parts.map((part) => part.label).join(' + '),
    filter: parts.map((part) => part.filter).filter(Boolean).join(' || '),
    summary: parts
      .map((part, index) => `【${index + 1}. ${part.label}】\n${part.summary}`)
      .join('\n\n'),
    fetchedAt: nowIso(),
    orderCount: parts.reduce((sum, part) => sum + (part.orderCount ?? 0), 0),
    needsSynthesis: true,
    parts,
  }
}

function wantsComplexPresentation(
  utterance: string,
  evidence: AssistantDataToolResult | null,
  planNeedsSynthesis: boolean,
): boolean {
  if (planNeedsSynthesis || evidence?.needsSynthesis || (evidence?.parts && evidence.parts.length > 1)) {
    return true
  }
  return /(为什么|怎么看|分析|建议|总结一下|解读|对比|趋势|适合|适配|推荐|哪些.*给)/i.test(utterance)
}

function buildFailureNotes(executions: QueryStepExecution[], rejectedSteps: string[]): string[] {
  return [
    ...rejectedSteps.map((item) => `计划拒绝：${item}`),
    ...executions
      .filter((item) => item.status === 'failed')
      .map((item) => `${item.plan.intent} 失败（${item.durationMs}ms）：${item.errorMessage ?? '未知错误'}`),
    ...executions
      .filter((item) => item.status === 'skipped')
      .map((item) => `${item.plan.intent} 跳过：${item.errorMessage ?? '无结果'}`),
  ]
}

function emptyMeta(partial?: Partial<AssistantQueryMeta>): AssistantQueryMeta {
  return {
    plannedBy: 'none',
    presentation: 'none',
    stepCount: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    durationMs: 0,
    fetchedAt: nowIso(),
    failures: [],
    rejectedSteps: [],
    ...partial,
  }
}

async function synthesizeWithDeepSeek(input: {
  utterance: string
  evidence: AssistantDataToolResult
  failures: string[]
  signal?: AbortSignal
}): Promise<string> {
  const failureBlock = input.failures.length
    ? `【查询告警】\n${input.failures.join('\n')}`
    : ''
  return (await createDeepSeekChatCompletion({
    signal: input.signal,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: [
          '你是 IT 运维助手。只能基于下方 Dataverse 实时查询证据回答，不要编造未出现的数字或工单。',
          '若用户问了多个子问题：按子问题分段回答，每段先给结论再列关键数据。',
          '涉及“适合给谁/推荐派单”时：结合负载、可接单、部门、技能与待派单列表给出建议，并说明依据。',
          '若存在查询失败/跳过，请在对应段落如实说明，不要假装查到了。',
          '不要在回复末尾添加 “via …” 署名。',
          formatAssistantDataToolForPrompt(input.evidence),
          failureBlock,
        ].filter(Boolean).join('\n'),
      },
      { role: 'user', content: input.utterance },
    ],
  })).trim()
}

function presentEvidence(input: {
  utterance: string
  evidence: AssistantDataToolResult
  failures: string[]
  plannedBy: AssistantQueryMeta['plannedBy']
  planNeedsSynthesis: boolean
  executions: QueryStepExecution[]
  validatedSteps: ValidatedPlanStep[]
  rejectedSteps: string[]
  plan: AssistantDataPlanBundle
  started: number
  signal?: AbortSignal
}): Promise<AssistantQueryPipelineResult> | AssistantQueryPipelineResult {
  const successCount = input.executions.filter((item) => item.status === 'success').length
  const failedCount = input.executions.filter((item) => item.status === 'failed').length
  const skippedCount = input.executions.filter((item) => item.status === 'skipped').length
  const fetchedAt = input.evidence.fetchedAt || nowIso()
  const baseMeta = {
    plannedBy: input.plannedBy,
    stepCount: input.executions.length,
    successCount,
    failedCount,
    skippedCount,
    fetchedAt,
    failures: input.failures,
    rejectedSteps: input.rejectedSteps,
  }

  const complex = wantsComplexPresentation(input.utterance, input.evidence, input.planNeedsSynthesis)
  if (complex && hasDeepSeekApiKey()) {
    return synthesizeWithDeepSeek({
      utterance: input.utterance,
      evidence: input.evidence,
      failures: input.failures,
      signal: input.signal,
    }).then((reply) => ({
      hit: true,
      reply,
      source: 'dataverse+deepseek' as const,
      evidence: input.evidence,
      meta: emptyMeta({
        ...baseMeta,
        presentation: 'synthesized',
        durationMs: Math.round(performance.now() - input.started),
      }),
      plan: input.plan,
      validatedSteps: input.validatedSteps,
      executions: input.executions,
    }))
  }

  const failureTail = input.failures.length ? `\n\n（查询告警）\n${input.failures.join('\n')}` : ''
  return {
    hit: true,
    reply: `${input.evidence.summary}${failureTail}`,
    source: 'dataverse',
    evidence: input.evidence,
    meta: emptyMeta({
      ...baseMeta,
      presentation: 'direct',
      durationMs: Math.round(performance.now() - input.started),
    }),
    plan: input.plan,
    validatedSteps: input.validatedSteps,
    executions: input.executions,
  }
}

/**
 * Unified ops-data flow:
 * 用户问题 → DeepSeek 结构化计划 → 应用校验权限/范围
 * → 预定义 Dataverse 只读查询 → 保留耗时/失败 → 直接呈现或 DeepSeek 组织语言
 */
export async function runAssistantQueryPipeline(input: {
  utterance: string
  permissions?: Partial<AssistantQueryPermissions>
  signal?: AbortSignal
}): Promise<AssistantQueryPipelineResult> {
  const started = performance.now()
  const utterance = input.utterance.trim()
  const permissions: AssistantQueryPermissions = {
    canQueryWorkOrders: input.permissions?.canQueryWorkOrders ?? true,
    canQueryEmployees: input.permissions?.canQueryEmployees ?? true,
    canViewDispatchAdvice: input.permissions?.canViewDispatchAdvice ?? true,
  }
  const emptyPlan: AssistantDataPlanBundle = { steps: [], needsSynthesis: false }

  if (!utterance) {
    return {
      hit: false,
      reply: '',
      source: 'dataverse',
      evidence: null,
      meta: emptyMeta({ durationMs: 0 }),
      plan: emptyPlan,
      validatedSteps: [],
      executions: [],
    }
  }

  let plannedBy: AssistantQueryMeta['plannedBy'] = 'none'
  let plan: AssistantDataPlanBundle = emptyPlan

  // 1) Structured query plan (DeepSeek → heuristic fallback)
  if (hasDeepSeekApiKey()) {
    try {
      plan = await planAssistantDataQueryWithDeepSeek(utterance, input.signal)
      plannedBy = 'deepseek'
    } catch {
      plan = planAssistantDataQueryHeuristic(utterance)
      plannedBy = 'heuristic'
    }
  } else {
    plan = planAssistantDataQueryHeuristic(utterance)
    plannedBy = 'heuristic'
  }

  // 2) Validate plan, permissions, and query scope
  let validated = validateAssistantDataPlanBundle(plan, permissions)

  // If DeepSeek plan was empty/rejected, retry with heuristic plan through the same gate.
  if (validated.acceptedPlans.length === 0 && plannedBy === 'deepseek') {
    plan = planAssistantDataQueryHeuristic(utterance)
    plannedBy = 'heuristic'
    validated = validateAssistantDataPlanBundle(plan, permissions)
  }

  if (validated.acceptedPlans.length === 0) {
    return {
      hit: false,
      reply: '',
      source: 'dataverse',
      evidence: null,
      meta: emptyMeta({
        plannedBy,
        durationMs: Math.round(performance.now() - started),
        rejectedSteps: validated.rejectedSteps,
        failures: validated.rejectedSteps.map((item) => `计划拒绝：${item}`),
      }),
      plan,
      validatedSteps: validated.validatedSteps,
      executions: [],
    }
  }

  // 3) Call predefined Dataverse read-only queries
  const executions = await executeValidatedSteps(validated.acceptedPlans, utterance)

  // 4) Validate results; retain timing + failure status
  const evidence = mergeEvidence(executions, plan.needsSynthesis)
  const failures = buildFailureNotes(executions, validated.rejectedSteps)
  const fetchedAt = executions.find((item) => item.result?.fetchedAt)?.result?.fetchedAt
    ?? executions[0]?.fetchedAt
    ?? nowIso()

  if (!evidence) {
    return {
      hit: false,
      reply: failures.length ? `Dataverse 查询未返回可用数据。\n${failures.join('\n')}` : '',
      source: 'dataverse',
      evidence: null,
      meta: emptyMeta({
        plannedBy,
        presentation: 'none',
        stepCount: executions.length,
        successCount: executions.filter((item) => item.status === 'success').length,
        failedCount: executions.filter((item) => item.status === 'failed').length,
        skippedCount: executions.filter((item) => item.status === 'skipped').length,
        durationMs: Math.round(performance.now() - started),
        fetchedAt,
        failures,
        rejectedSteps: validated.rejectedSteps,
      }),
      plan,
      validatedSteps: validated.validatedSteps,
      executions,
    }
  }

  // 5) Simple stats by app; complex wording by DeepSeek
  return presentEvidence({
    utterance,
    evidence,
    failures,
    plannedBy,
    planNeedsSynthesis: plan.needsSynthesis,
    executions,
    validatedSteps: validated.validatedSteps,
    rejectedSteps: validated.rejectedSteps,
    plan,
    started,
    signal: input.signal,
  })
}

export function formatAssistantQuerySourceLabel(
  source: AssistantQuerySource,
  meta?: AssistantQueryMeta | null,
  modelLabel?: string,
  options?: { withWeb?: boolean },
): string {
  if (source === 'local-data') return 'local-data（页面缓存降级）'
  if (source === 'deepseek-web') return `${modelLabel || 'deepseek'} + web`
  if (source === 'deepseek') return modelLabel || 'deepseek'

  const webSuffix = options?.withWeb ? ' + 联网' : ''

  if (!meta) {
    return source === 'dataverse+deepseek'
      ? `dataverse 只读查询 + DeepSeek 组织${webSuffix}`
      : `dataverse 只读查询${webSuffix}`
  }

  const bits = [
    `${meta.successCount}/${Math.max(meta.stepCount, meta.successCount)} 步成功`,
    `${meta.durationMs}ms`,
  ]
  if (meta.failedCount > 0) bits.push(`${meta.failedCount} 步失败`)
  if (meta.rejectedSteps.length > 0) bits.push(`${meta.rejectedSteps.length} 步拒绝`)

  return source === 'dataverse+deepseek'
    ? `dataverse 只读查询 + DeepSeek 组织${webSuffix}（${bits.join(' · ')}）`
    : `dataverse 只读查询${webSuffix}（${bits.join(' · ')}）`
}
