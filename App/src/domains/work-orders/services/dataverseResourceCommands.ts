import type { IOperationResult } from '@microsoft/power-apps/data'
import { Cr590_servicecategoriesService } from '../../../generated/services/Cr590_servicecategoriesService'
import type { Cr590_servicecategoriesBase, Cr590_servicecategoriescr590_defaultpriority } from '../../../generated/models/Cr590_servicecategoriesModel'
import { Cr590_table1sService } from '../../../generated/services/Cr590_table1sService'
import type { Cr590_table1sBase, Cr590_table1sstatecode, Cr590_table1sstatuscode } from '../../../generated/models/Cr590_table1sModel'
import { Cr590_table2sService } from '../../../generated/services/Cr590_table2sService'
import type { Cr590_table2sBase, Cr590_table2scr590_gender, Cr590_table2sstatecode, Cr590_table2sstatuscode } from '../../../generated/models/Cr590_table2sModel'

const ENTITY_SETS = {
  employees: 'cr590_table2s',
  departments: 'cr590_table1s',
} as const

export type EmployeeResourceUpdate = {
  employeeName: string
  email: string
  departmentId: string | null
  gender: Cr590_table2scr590_gender | null
  age: number | null
  hireDate: string | null
  isActive: boolean
  isAvailableForOrder: boolean
  maxTaskLoad: number | null
  skills: string
}

export type DepartmentResourceUpdate = {
  departmentCode: string
  departmentName: string
  description: string
  establishedDate: string | null
  managerId: string | null
  isActive: boolean
}

export type ServiceCategoryResourceUpdate = {
  categoryCode: string
  serviceCategoryName: string
  defaultDepartmentId: string | null
  defaultPriority: Cr590_servicecategoriescr590_defaultpriority | null
  description: string
  isActive: boolean
}

function unwrapWrite<T>(result: IOperationResult<T>, resourceName: string): void {
  if (result.success) return
  const error = result.error
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '运行时未提供错误详情'
  throw new Error(`Dataverse ${resourceName} 更新失败：${message}`)
}

function dateOnlyValue(value: string | null): string | null {
  return value ? `${value}T00:00:00.000Z` : null
}

export async function updateDataverseEmployee(id: string, input: EmployeeResourceUpdate): Promise<void> {
  const payload = {
    cr590_employeename: input.employeeName.trim(),
    cr590_email: input.email.trim() || null,
    'cr590_Department@odata.bind': input.departmentId ? `/${ENTITY_SETS.departments}(${input.departmentId})` : null,
    cr590_gender: input.gender,
    cr590_age: input.age,
    cr590_hiredate: dateOnlyValue(input.hireDate),
    cr590_isactive: input.isActive,
    cr590_isavailablefororder: input.isAvailableForOrder,
    cr590_maxtaskload: input.maxTaskLoad,
    cr590_skills: input.skills.trim() || null,
    statecode: (input.isActive ? 0 : 1) as Cr590_table2sstatecode,
    statuscode: (input.isActive ? 1 : 2) as Cr590_table2sstatuscode,
  }
  const result = await Cr590_table2sService.update(id, payload as unknown as Partial<Omit<Cr590_table2sBase, 'cr590_table2id'>>)
  unwrapWrite(result, 'Employee')
}

export async function updateDataverseDepartment(id: string, input: DepartmentResourceUpdate): Promise<void> {
  const payload = {
    cr590_deparmentcode: input.departmentCode.trim() || null,
    cr590_departmentname: input.departmentName.trim(),
    cr590_description: input.description.trim() || null,
    cr590_establisheddate: dateOnlyValue(input.establishedDate),
    cr590_isactive: input.isActive,
    'cr590_Manager@odata.bind': input.managerId ? `/${ENTITY_SETS.employees}(${input.managerId})` : null,
    statecode: (input.isActive ? 0 : 1) as Cr590_table1sstatecode,
    statuscode: (input.isActive ? 1 : 2) as Cr590_table1sstatuscode,
  }
  const result = await Cr590_table1sService.update(id, payload as unknown as Partial<Omit<Cr590_table1sBase, 'cr590_table1id'>>)
  unwrapWrite(result, 'Department')
}

export async function updateDataverseServiceCategory(id: string, input: ServiceCategoryResourceUpdate): Promise<void> {
  const payload = {
    cr590_categorycode: input.categoryCode.trim() || null,
    cr590_servicecategoryname: input.serviceCategoryName.trim(),
    'cr590_DefaultDepartment@odata.bind': input.defaultDepartmentId ? `/${ENTITY_SETS.departments}(${input.defaultDepartmentId})` : null,
    cr590_defaultpriority: input.defaultPriority,
    cr590_description: input.description.trim() || null,
    cr590_isactive: input.isActive,
    statecode: input.isActive ? 0 : 1,
    statuscode: input.isActive ? 1 : 2,
  }
  const result = await Cr590_servicecategoriesService.update(id, payload as unknown as Partial<Omit<Cr590_servicecategoriesBase, 'cr590_servicecategoryid'>>)
  unwrapWrite(result, 'ServiceCategory')
}
