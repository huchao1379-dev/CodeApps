import { useEffect, useState } from 'react'
import { PRIORITY } from '../types/workOrder.types'
import type { DepartmentOption, EmployeeOption, ServiceCategoryOption } from '../types/workOrder.types'
import type { DepartmentResourceUpdate, EmployeeResourceUpdate, ServiceCategoryResourceUpdate } from '../services/dataverseResourceCommands'
import { useOverlayFocus } from '../../../shared/components/overlays/useOverlayFocus'

export type EditableResource =
  | { type: 'employee'; record: EmployeeOption }
  | { type: 'department'; record: DepartmentOption }
  | { type: 'category'; record: ServiceCategoryOption }

export type ResourceEditValues =
  | { type: 'employee'; id: string; values: EmployeeResourceUpdate }
  | { type: 'department'; id: string; values: DepartmentResourceUpdate }
  | { type: 'category'; id: string; values: ServiceCategoryResourceUpdate }

interface ResourceEditDialogProps {
  resource: EditableResource | null
  employees: EmployeeOption[]
  departments: DepartmentOption[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: ResourceEditValues) => Promise<void>
}

const genderOptions = [
  { value: 326990000, label: '男' },
  { value: 326990001, label: '女' },
  { value: 326990002, label: '其他' },
] as const

const categoryPriorityOptions = [
  { value: PRIORITY.low, label: '低' },
  { value: PRIORITY.medium, label: '普通' },
  { value: PRIORITY.high, label: '高' },
] as const

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (datePart) return datePart
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export function ResourceEditDialog({ resource, employees, departments, busy, error, onClose, onSubmit }: ResourceEditDialogProps) {
  const dialogRef = useOverlayFocus<HTMLElement>(resource !== null, onClose)
  const [employeeName, setEmployeeName] = useState('')
  const [email, setEmail] = useState('')
  const [employeeDepartmentId, setEmployeeDepartmentId] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [hireDate, setHireDate] = useState('')
  const [employeeActive, setEmployeeActive] = useState(true)
  const [availableForOrder, setAvailableForOrder] = useState(true)
  const [maxTaskLoad, setMaxTaskLoad] = useState('')
  const [skills, setSkills] = useState('')
  const [departmentCode, setDepartmentCode] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [managerId, setManagerId] = useState('')
  const [departmentDescription, setDepartmentDescription] = useState('')
  const [establishedDate, setEstablishedDate] = useState('')
  const [departmentActive, setDepartmentActive] = useState(true)
  const [categoryCode, setCategoryCode] = useState('')
  const [serviceCategoryName, setServiceCategoryName] = useState('')
  const [defaultDepartmentId, setDefaultDepartmentId] = useState('')
  const [defaultPriority, setDefaultPriority] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [categoryActive, setCategoryActive] = useState(true)

  useEffect(() => {
    if (!resource) return
    if (resource.type === 'employee') {
      const item = resource.record
      setEmployeeName(item.employeeName)
      setEmail(item.email ?? '')
      setEmployeeDepartmentId(item.departmentId ?? '')
      setGender(item.genderValue == null ? '' : String(item.genderValue))
      setAge(item.age == null ? '' : String(item.age))
      setHireDate(toDateInput(item.hireDate))
      setEmployeeActive(item.isActive)
      setAvailableForOrder(item.isAvailableForOrder)
      setMaxTaskLoad(item.maxTaskLoad == null ? '' : String(item.maxTaskLoad))
      setSkills(item.skills ?? '')
    }
    if (resource.type === 'department') {
      const item = resource.record
      setDepartmentCode(item.departmentCode)
      setDepartmentName(item.departmentName)
      setManagerId(item.managerId ?? '')
      setDepartmentDescription(item.description ?? '')
      setEstablishedDate(toDateInput(item.establishedDate))
      setDepartmentActive(item.isActive)
    }
    if (resource.type === 'category') {
      const item = resource.record
      setCategoryCode(item.categoryCode)
      setServiceCategoryName(item.serviceCategoryName)
      setDefaultDepartmentId(item.defaultDepartmentId ?? '')
      setDefaultPriority(item.defaultPriority == null ? '' : String(item.defaultPriority))
      setCategoryDescription(item.description ?? '')
      setCategoryActive(item.isActive)
    }
  }, [resource])

  if (!resource) return null

  const title = resource.type === 'employee' ? '编辑员工'
    : resource.type === 'department' ? '编辑部门' : '编辑服务类别'
  const subtitle = resource.type === 'employee' ? resource.record.employeeName
    : resource.type === 'department' ? resource.record.departmentName : resource.record.serviceCategoryName

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose()
  }}>
    <section ref={dialogRef} tabIndex={-1} className="modal-card resource-edit-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div>
        <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" disabled={busy} onClick={onClose}>×</button>
      </header>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault()
        if (resource.type === 'employee') {
          onSubmit({
            type: 'employee', id: resource.record.id,
            values: {
              employeeName: employeeName.trim(), email, departmentId: employeeDepartmentId || null,
              gender: gender === '' ? null : Number(gender) as NonNullable<EmployeeResourceUpdate['gender']>,
              age: age === '' ? null : Number(age), hireDate: hireDate || null,
              isActive: employeeActive, isAvailableForOrder: availableForOrder,
              maxTaskLoad: maxTaskLoad === '' ? null : Number(maxTaskLoad), skills,
            },
          })
        }
        if (resource.type === 'department') {
          onSubmit({
            type: 'department', id: resource.record.id,
            values: { departmentCode, departmentName: departmentName.trim(), description: departmentDescription, establishedDate: establishedDate || null, managerId: managerId || null, isActive: departmentActive },
          })
        }
        if (resource.type === 'category') {
          onSubmit({
            type: 'category', id: resource.record.id,
            values: {
              categoryCode, serviceCategoryName: serviceCategoryName.trim(), defaultDepartmentId: defaultDepartmentId || null,
              defaultPriority: defaultPriority === '' ? null : Number(defaultPriority) as NonNullable<ServiceCategoryResourceUpdate['defaultPriority']>,
              description: categoryDescription, isActive: categoryActive,
            },
          })
        }
      }}>
        <div className="modal-content">
          {resource.type === 'employee' && <>
            <label>员工姓名<b>*</b><input required maxLength={850} value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} /></label>
            <div className="form-row">
              <label>邮箱<input type="email" maxLength={100} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>所属部门<select value={employeeDepartmentId} onChange={(event) => setEmployeeDepartmentId(event.target.value)}>
                <option value="">未指定</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.departmentName}</option>)}
              </select></label>
            </div>
            <div className="form-row">
              <label>性别<select value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">未设置</option>{genderOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select></label>
              <label>年龄<input type="number" min={0} step={1} value={age} onChange={(event) => setAge(event.target.value)} /></label>
            </div>
            <div className="form-row">
              <label>入职日期<input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} /></label>
              <label>最大工单负载<input type="number" min={0} step={1} value={maxTaskLoad} onChange={(event) => setMaxTaskLoad(event.target.value)} /></label>
            </div>
            <label>技能<input maxLength={100} value={skills} onChange={(event) => setSkills(event.target.value)} /></label>
            <div className="resource-toggle-row">
              <label className="resource-toggle"><input type="checkbox" checked={employeeActive} onChange={(event) => setEmployeeActive(event.target.checked)} /><span>在职</span></label>
              <label className="resource-toggle"><input type="checkbox" checked={availableForOrder} onChange={(event) => setAvailableForOrder(event.target.checked)} /><span>可接单</span></label>
            </div>
          </>}
          {resource.type === 'department' && <>
            <div className="form-row">
              <label>部门编号<input maxLength={100} value={departmentCode} onChange={(event) => setDepartmentCode(event.target.value)} /></label>
              <label>部门名称<b>*</b><input required maxLength={850} value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} /></label>
            </div>
            <label>部门经理<select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              <option value="">未指定</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employeeName}</option>)}
            </select></label>
            <div className="form-row">
              <label>成立日期<input type="date" value={establishedDate} onChange={(event) => setEstablishedDate(event.target.value)} /></label>
              <label>状态<select value={departmentActive ? 'active' : 'inactive'} onChange={(event) => setDepartmentActive(event.target.value === 'active')}>
                <option value="active">启用</option><option value="inactive">停用</option>
              </select></label>
            </div>
            <label>说明<input maxLength={100} value={departmentDescription} onChange={(event) => setDepartmentDescription(event.target.value)} /></label>
          </>}
          {resource.type === 'category' && <>
            <div className="form-row">
              <label>类别编号<input maxLength={100} value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} /></label>
              <label>服务类别名称<b>*</b><input required maxLength={850} value={serviceCategoryName} onChange={(event) => setServiceCategoryName(event.target.value)} /></label>
            </div>
            <div className="form-row">
              <label>默认部门<select value={defaultDepartmentId} onChange={(event) => setDefaultDepartmentId(event.target.value)}>
                <option value="">未指定</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.departmentName}</option>)}
              </select></label>
              <label>默认优先级<select value={defaultPriority} onChange={(event) => setDefaultPriority(event.target.value)}>
                <option value="">未设置</option>{categoryPriorityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select></label>
            </div>
            <label>状态<select value={categoryActive ? 'active' : 'inactive'} onChange={(event) => setCategoryActive(event.target.value === 'active')}>
              <option value="active">启用</option><option value="inactive">停用</option>
            </select></label>
            <label>说明<input maxLength={100} value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} /></label>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-footer"><button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? '保存中…' : '保存更改'}</button>
        </footer>
      </form>
    </section>
  </div>
}
