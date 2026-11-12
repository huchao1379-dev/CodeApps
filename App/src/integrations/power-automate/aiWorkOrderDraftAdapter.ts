import { getContext } from '@microsoft/power-apps/app'
import { AI___Service } from '../../generated/services/AI___Service'
import { PRIORITY, type DepartmentOption, type Priority, type ServiceCategoryOption, type WorkOrderInput } from '../../domains/work-orders/types/workOrder.types'

export type AiWorkOrderDraft = {
  workOrderName: string
  issueDescription: string
  priority: Priority
  priorityLabel: string
  categoryName: string
  departmentHint: string
  confidence: number | null
  lowConfidenceFields: string[]
  rationale: string
  serviceCategoryId: string
  departmentId: string
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

function matchByName<T extends { id: string }>(
  items: T[],
  hint: string,
  getName: (item: T) => string,
): T | null {
  const normalizedHint = hint.trim().toLocaleLowerCase()
  if (!normalizedHint) return null
  const exact = items.find((item) => getName(item).trim().toLocaleLowerCase() === normalizedHint)
  if (exact) return exact
  const partial = items.find((item) => {
    const name = getName(item).trim().toLocaleLowerCase()
    return name.includes(normalizedHint) || normalizedHint.includes(name)
  })
  return partial ?? null
}

export function buildCategoryCatalog(categories: ServiceCategoryOption[]): string {
  return categories
    .filter((category) => category.isActive)
    .map((category) => category.serviceCategoryName.trim())
    .filter(Boolean)
    .join(',')
    .slice(0, 500)
}

export function toWorkOrderInputFromAiDraft(draft: AiWorkOrderDraft): WorkOrderInput {
  return {
    workOrderName: draft.workOrderName.trim().slice(0, 850),
    issueDescription: draft.issueDescription.trim().slice(0, 100),
    priority: draft.priority,
    departmentId: draft.departmentId,
    serviceCategoryId: draft.serviceCategoryId,
    expectedCompletionTime: null,
  }
}

export function resolveAiDraftAgainstCatalog(
  draft: Omit<AiWorkOrderDraft, 'serviceCategoryId' | 'departmentId'>,
  departments: DepartmentOption[],
  categories: ServiceCategoryOption[],
): AiWorkOrderDraft {
  const activeDepartments = departments.filter((department) => department.isActive)
  const activeCategories = categories.filter((category) => category.isActive)
  const category = matchByName(activeCategories, draft.categoryName, (item) => item.serviceCategoryName)
  const departmentFromHint = matchByName(activeDepartments, draft.departmentHint, (item) => item.departmentName)
  const departmentFromCategory = category?.defaultDepartmentId
    ? activeDepartments.find((item) => item.id === category.defaultDepartmentId) ?? null
    : null
  const department = departmentFromHint ?? departmentFromCategory

  const lowConfidenceFields = new Set(draft.lowConfidenceFields.map((field) => field.toLocaleLowerCase()))
  if (!category) lowConfidenceFields.add('categoryname')
  if (!department) lowConfidenceFields.add('departmenthint')

  return {
    ...draft,
    priority: category?.defaultPriority && draft.priorityLabel.trim() === '' ? category.defaultPriority : draft.priority,
    serviceCategoryId: category?.id ?? '',
    departmentId: department?.id ?? '',
    lowConfidenceFields: [...lowConfidenceFields],
  }
}

export async function parseWorkOrderDraftFromUtterance(
  utterance: string,
  categories: ServiceCategoryOption[],
  departments: DepartmentOption[],
): Promise<AiWorkOrderDraft> {
  const text = utterance.trim()
  if (!text) throw new Error('请先输入用户需求描述。')

  const context = await getContext()
  const result = await AI___Service.Run({
    text: text.slice(0, 500),
    text_1: buildCategoryCatalog(categories) || undefined,
    text_2: context.user.userPrincipalName?.trim().slice(0, 100) || undefined,
  })

  if (!result.success) {
    const message = result.error instanceof Error ? result.error.message : '运行时未提供错误详情'
    if (/connection reference not found/i.test(message)) {
      throw new Error(
        `AI 解析工单失败：找不到 Flow「AI建工单」的连接引用（ai___）。请重启本地连接服务后重试：在 App 目录执行 npx @microsoft/power-apps-cli app run --config-only --local-app-url http://localhost:3000，再另开终端 npm run dev；或执行 npm run build && pac code push 后在 Power Apps 中打开应用。原始错误：${message}`,
      )
    }
    throw new Error(`AI 解析工单失败：${message}`)
  }

  const response = result.data as typeof result.data & Record<string, unknown>
  const workOrderName = firstText(response.workordername, response.workOrderName, response.title)
  const issueDescription = firstText(response.issuedescription, response.issueDescription, response.description)
  const priorityLabel = firstText(response.prioritylabel, response.priorityLabel, response.priority)
  const categoryName = firstText(response.categoryname, response.categoryName, response.category)
  const departmentHint = firstText(response.departmenthint, response.departmentHint, response.department)
  const rationale = firstText(response.rationale, response.reason, response.message)
  const lowConfidenceFields = splitList(firstText(response.lowconfidencefields, response.lowConfidenceFields))
  const confidence = normalizeConfidence(response.confidence ?? response.Confidence)

  if (!workOrderName && !issueDescription) {
    throw new Error(rationale || 'AI 未返回可用的工单标题或问题描述，请补充描述后重试。')
  }

  const normalizedName = (workOrderName || issueDescription.slice(0, 40) || 'AI 生成工单').slice(0, 850)
  const normalizedDescription = (issueDescription || workOrderName).slice(0, 100)

  return resolveAiDraftAgainstCatalog({
    workOrderName: normalizedName,
    issueDescription: normalizedDescription,
    priority: mapPriorityLabel(priorityLabel),
    priorityLabel: priorityLabel || '普通',
    categoryName,
    departmentHint,
    confidence,
    lowConfidenceFields,
    rationale,
  }, departments, categories)
}
