import { WorkOrderMaterialsService } from '../../generated/services/WorkOrderMaterialsService'
import type { WorkOrderMaterialsRead } from '../../generated/models/WorkOrderMaterialsModel'
import type { WorkOrderMaterial, WorkOrderMaterialsRepository } from '../contracts/workOrderMaterialsRepository'

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''")
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function mapMaterial(row: WorkOrderMaterialsRead): WorkOrderMaterial {
  const fileName = asText(row['{FilenameWithExtension}'])
    ?? asText(row['{Name}'])
    ?? asText(row.Title)
    ?? '未命名文件'
  return {
    id: String(row.ID ?? row['{Identifier}'] ?? fileName),
    title: asText(row.Title) ?? fileName,
    workOrderNumber: asText(row.WorkOrderNumber) ?? '',
    serviceCategory: asText(row.ServiceCategory),
    materialType: asText(row.MaterialType?.Value),
    fileName,
    webUrl: asText(row['{Link}']),
    isFolder: row['{IsFolder}'] === true,
    modifiedAt: asText(row.Modified),
    authorName: asText(row.Author?.DisplayName),
  }
}

function matchesWorkOrderNumber(row: WorkOrderMaterialsRead, workOrderNumber: string): boolean {
  const value = asText(row.WorkOrderNumber)
  if (!value) return false
  return value.localeCompare(workOrderNumber, undefined, { sensitivity: 'accent' }) === 0
}

function toRepositoryError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`读取 SharePoint 工单资料失败：${error.message}`)
  }
  return new Error('读取 SharePoint 工单资料失败：运行时未提供错误详情。')
}

/**
 * SharePoint 文档库 WorkOrderMaterials 适配器。
 * 按 WorkOrderNumber 与工单编号关联；优先服务端 $filter，失败时回退本地筛选。
 */
export const sharePointWorkOrderMaterialsRepository: WorkOrderMaterialsRepository = {
  async listByWorkOrderNumber(workOrderNumber) {
    const needle = workOrderNumber.trim()
    if (!needle) return []

    const select = [
      'ID', 'Title', 'WorkOrderNumber', 'ServiceCategory', 'MaterialType', 'Modified',
      '{Link}', '{Name}', '{FilenameWithExtension}', '{IsFolder}', '{Identifier}',
    ] as string[]

    try {
      const filtered = await WorkOrderMaterialsService.getAll({
        select,
        filter: `WorkOrderNumber eq '${escapeODataString(needle)}'`,
        orderBy: ['Modified desc'],
        maxPageSize: 100,
      })
      if (!filtered.success) throw filtered.error ?? new Error('SharePoint 返回失败结果')
      return (filtered.data ?? [])
        .map(mapMaterial)
        .filter((item) => !item.isFolder)
    } catch (filterError) {
      // 部分环境下文档库 $filter 字段行为不稳定，回退为读取后本地匹配，保证详情页可用。
      try {
        const all = await WorkOrderMaterialsService.getAll({
          select,
          orderBy: ['Modified desc'],
          maxPageSize: 500,
        })
        if (!all.success) throw all.error ?? filterError
        return (all.data ?? [])
          .filter((row) => matchesWorkOrderNumber(row, needle))
          .map(mapMaterial)
          .filter((item) => !item.isFolder)
      } catch (fallbackError) {
        throw toRepositoryError(fallbackError)
      }
    }
  },
}
