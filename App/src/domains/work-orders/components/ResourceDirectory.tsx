import { useEffect, useMemo, useState } from 'react'
import { DataTable, SearchInput, StatusBadge, type TableColumn } from '../../../shared/components'
import { WORK_ORDER_PAGE_SIZE } from '../config/workOrderWorkspace'
import { PRIORITY_LABELS, type DepartmentOption, type EmployeeOption, type ServiceCategoryOption, type WorkOrderStoreState } from '../types/workOrder.types'
import type { ResourceTab } from '../types/workspace.types'
import { formatDate } from '../utils/formatDate'
import type { EditableResource } from './ResourceEditDialog'
import { Avatar } from './WorkOrderBadges'

export interface ResourceDirectoryProps {
  state: WorkOrderStoreState
  tab: ResourceTab
  query: string
  loading: boolean
  canEdit?: boolean
  onQueryChange: (query: string) => void
  onEditResource: (resource: EditableResource) => void
}

export function ResourceDirectory({
  state,
  tab,
  query,
  loading,
  canEdit = true,
  onQueryChange,
  onEditResource,
}: ResourceDirectoryProps) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(WORK_ORDER_PAGE_SIZE)
  const normalized = query.trim().toLocaleLowerCase()
  const employeeRows = useMemo(() => (state.employees ?? []).filter((row) =>
    [row.employeeName, row.email, row.department, row.skills].some((value) => value?.toLocaleLowerCase().includes(normalized)),
  ), [state.employees, normalized])
  const departmentRows = useMemo(() => (state.departments ?? []).filter((row) =>
    [row.departmentCode, row.departmentName, row.managerName, row.description].some((value) => value?.toLocaleLowerCase().includes(normalized)),
  ), [state.departments, normalized])
  const categoryRows = useMemo(() => (state.serviceCategories ?? []).filter((row) =>
    [row.categoryCode, row.serviceCategoryName, row.defaultDepartmentName, row.description].some((value) => value?.toLocaleLowerCase().includes(normalized)),
  ), [state.serviceCategories, normalized])
  const total = tab === 'employees' ? employeeRows.length : tab === 'departments' ? departmentRows.length : categoryRows.length
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const currentPage = Math.min(page, pageCount)
  useEffect(() => { setPage(1) }, [tab, query])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  const openEdit = (resource: EditableResource) => {
    if (!canEdit) return
    onEditResource(resource)
  }

  const editButton = (resource: EditableResource, label: string) => <button
    className="resource-edit-action"
    type="button"
    aria-label={`编辑${label}`}
    disabled={!canEdit}
    title={!canEdit ? '当前角色无编辑资源权限' : `编辑${label}`}
    onClick={(event) => { event.stopPropagation(); openEdit(resource) }}
  >✎</button>

  const employeeColumns: TableColumn<EmployeeOption>[] = [
    { key: 'employeeName', title: '员工', width: 160, render: (_, employee) => <div className="assignee-cell"><Avatar small name={employee.employeeName} /><strong>{employee.employeeName}</strong></div> },
    { key: 'department', title: '部门', width: 120 },
    { key: 'email', title: '邮箱', width: 180 },
    { key: 'gender', title: '性别', width: 70 },
    { key: 'age', title: '年龄', width: 70 },
    { key: 'hireDate', title: '入职日期', width: 120, render: (_, employee) => formatDate(employee.hireDate, true) },
    { key: 'isActive', title: '接单状态', width: 150, render: (_, employee) => <div className="resource-status-stack">
      <StatusBadge status={employee.isActive ? 'active' : 'inactive'} label={employee.isActive ? '在职' : '停用'} size="small" />
      <StatusBadge status={employee.isAvailableForOrder ? 'available' : 'unavailable'} label={employee.isAvailableForOrder ? '可接单' : '暂不可接单'} size="small" />
    </div> },
    { key: 'maxTaskLoad', title: '负载上限', width: 90, render: (value) => value == null ? '未设置' : String(value) },
    { key: 'skills', title: '技能', width: 160, render: (value) => <span className="resource-skills">{value == null || value === '' ? '—' : String(value)}</span> },
    { key: 'actions', title: '操作', width: 56, align: 'center', render: (_, employee) => <span className="resource-actions">{editButton({ type: 'employee', record: employee }, '员工')}</span> },
  ]
  const departmentColumns: TableColumn<DepartmentOption>[] = [
    { key: 'departmentCode', title: '部门编号', width: 110 },
    { key: 'departmentName', title: '部门名称', width: 160, render: (_, department) => <strong>{department.departmentName}</strong> },
    { key: 'managerName', title: '部门经理', width: 120 },
    { key: 'description', title: '说明', width: 200 },
    { key: 'establishedDate', title: '成立日期', width: 120, render: (_, department) => formatDate(department.establishedDate, true) },
    { key: 'isActive', title: '状态', width: 90, render: (_, department) => <StatusBadge status={department.isActive ? 'active' : 'inactive'} label={department.isActive ? '启用' : '停用'} size="small" /> },
    { key: 'actions', title: '操作', width: 56, align: 'center', render: (_, department) => <span className="resource-actions">{editButton({ type: 'department', record: department }, '部门')}</span> },
  ]
  const categoryColumns: TableColumn<ServiceCategoryOption>[] = [
    { key: 'categoryCode', title: '类别编号', width: 110 },
    { key: 'serviceCategoryName', title: '服务类别', width: 160, render: (_, category) => <strong>{category.serviceCategoryName}</strong> },
    { key: 'defaultDepartmentName', title: '默认部门', width: 130 },
    { key: 'defaultPriority', title: '默认优先级', width: 110, render: (_, category) => category.defaultPriority === null ? '—' : PRIORITY_LABELS[category.defaultPriority] },
    { key: 'description', title: '说明', width: 200 },
    { key: 'isActive', title: '状态', width: 90, render: (_, category) => <StatusBadge status={category.isActive ? 'active' : 'inactive'} label={category.isActive ? '启用' : '停用'} size="small" /> },
    { key: 'actions', title: '操作', width: 56, align: 'center', render: (_, category) => <span className="resource-actions">{editButton({ type: 'category', record: category }, '服务类别')}</span> },
  ]

  const title = tab === 'employees' ? '员工' : tab === 'departments' ? '部门' : '服务类别'
  const pagination = { page: currentPage, pageSize, total }
  const onPaginationChange = (next: { page: number; pageSize: number; total?: number }) => {
    setPage(next.page)
    setPageSize(next.pageSize)
  }
  const slice = <T,>(items: T[]) => items.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return <section className="work-order-card resource-card">
    <header className="list-header"><div><div className="list-title-row"><h2>{title}</h2><span className="result-count">{loading ? '…' : total}</span></div><p>{canEdit ? '复用共享 DataTable；单击记录行可编辑字段' : '当前角色仅可查看资源目录，不可编辑'}</p></div>
      <SearchInput value={query} onChange={onQueryChange} placeholder="搜索名称、编号或说明" ariaLabel="搜索基础资源" />
    </header>
    {tab === 'employees' && <DataTable data={slice(employeeRows)} columns={employeeColumns} rowKey={(row) => row.id} ariaLabel="员工列表"
      loading={loading} loadingLabel="正在读取基础资源…" emptyTitle={normalized ? '没有匹配的记录' : '暂无资源记录'}
      emptyDescription={normalized ? '调整搜索词后再试。' : '该数据源当前没有可显示的记录。'}
      onRowClick={(employee) => openEdit({ type: 'employee', record: employee })}
      pagination={pagination} onPaginationChange={onPaginationChange} />}
    {tab === 'departments' && <DataTable data={slice(departmentRows)} columns={departmentColumns} rowKey={(row) => row.id} ariaLabel="部门列表"
      loading={loading} loadingLabel="正在读取基础资源…" emptyTitle={normalized ? '没有匹配的记录' : '暂无资源记录'}
      emptyDescription={normalized ? '调整搜索词后再试。' : '该数据源当前没有可显示的记录。'}
      onRowClick={(department) => openEdit({ type: 'department', record: department })}
      pagination={pagination} onPaginationChange={onPaginationChange} />}
    {tab === 'categories' && <DataTable data={slice(categoryRows)} columns={categoryColumns} rowKey={(row) => row.id} ariaLabel="服务类别列表"
      loading={loading} loadingLabel="正在读取基础资源…" emptyTitle={normalized ? '没有匹配的记录' : '暂无资源记录'}
      emptyDescription={normalized ? '调整搜索词后再试。' : '该数据源当前没有可显示的记录。'}
      onRowClick={(category) => openEdit({ type: 'category', record: category })}
      pagination={pagination} onPaginationChange={onPaginationChange} />}
  </section>
}
