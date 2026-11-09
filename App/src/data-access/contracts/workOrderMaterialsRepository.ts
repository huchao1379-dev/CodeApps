export interface WorkOrderMaterial {
  id: string
  title: string
  workOrderNumber: string
  serviceCategory: string | null
  materialType: string | null
  fileName: string
  webUrl: string | null
  isFolder: boolean
  modifiedAt: string | null
  authorName: string | null
}

export interface WorkOrderMaterialsRepository {
  listByWorkOrderNumber(workOrderNumber: string): Promise<WorkOrderMaterial[]>
}
