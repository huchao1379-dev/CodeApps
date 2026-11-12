import { useEffect, useMemo, useRef, useState } from 'react'
import { priorityOptions, workOrderStatusOptions } from '../config/workOrderChoices'
import {
  STATUS_LABELS,
  WORK_ORDER_STATUS,
  type EmployeeOption,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderStoreState,
} from '../types/workOrder.types'
import {
  loadWorkOrderAssignmentSnapshot,
  loadWorkOrderStateFromDataverse,
  loadWorkOrdersByServerPreset,
} from '../services/dataverseWorkOrderRepository'
import { loadPendingAssignmentCounts } from '../services/assignmentApprovalRepository'
import { submitAssignmentApprovalRequest } from '../../../integrations/power-automate/assignmentApprovalAdapter'
import {
  assignDataverseWorkOrder,
  createDataverseWorkOrder,
  PartialWorkOrderWriteError,
  transitionDataverseWorkOrder,
  unassignDataverseWorkOrder,
  updateDataverseWorkOrder,
} from '../services/dataverseWorkOrderCommands'
import {
  updateDataverseDepartment,
  updateDataverseEmployee,
  updateDataverseServiceCategory,
} from '../services/dataverseResourceCommands'
import { seedDataverseITTestData, type TestDataSeedPhase } from '../services/dataverseTestDataSeeder'
import { ResourceEditDialog, type EditableResource, type ResourceEditValues } from '../components/ResourceEditDialog'
import {
  AssignmentDialog,
  NoteDialog,
  StatusDialog,
  WorkOrderFormDialog,
} from '../components/WorkOrderActionDialogs'
import {
  AiWorkOrderCreateDialog,
  CreateWorkOrderChoiceDialog,
} from '../components/AiWorkOrderCreateDialogs'
import { Toast } from '../../../shared/components'
import type { BulkAction, DatePeriod, FilterDefinition, FilterValues, SortState } from '../../../shared/components'
import { AppHeader, AppLayout, AppSidebar, PageContainer } from '../../../workbench/layout'
import {
  NavIconAccess,
  NavIconAlerts,
  NavIconApprovals,
  NavIconBatches,
  NavIconCalendar,
  NavIconDispatch,
  NavIconInventory,
  NavIconOverview,
  NavIconReplenish,
  NavIconResources,
  NavIconStocktake,
  NavIconWorkOrders,
} from '../../../workbench/navigation/NavIcons'
import { RolePermissionPage } from '../../access-control/pages/RolePermissionPage'
import { useAccessControl } from '../../access-control/context/AccessControlContext'
import { APP_PERMISSION_LABELS, getRoleDefinition, type AppPermission } from '../../access-control/types/access.types'
import { WorkspaceSwitcher, type WorkspaceId } from '../../../workbench/workspace'
import { WorkOrderDispatchBoard } from '../components/WorkOrderDispatchBoard'
import { WorkOrderOperationsDashboard } from '../components/WorkOrderOperationsDashboard'
import { AssignmentApprovalRequestsPage } from '../components/AssignmentApprovalRequestsPage'
import { OrgCalendarPage } from './OrgCalendarPage'
import { WorkOrderBatchActionDialog, type WorkOrderBatchAction, type WorkOrderBatchActionInput } from '../components/WorkOrderBatchActionDialog'
import { InventoryWorkspacePanel, type InventoryView } from '../../inventory/pages/InventoryWorkspacePanel'
import { ACTIVE_STATUSES, BATCH_CONCURRENCY, emptyWorkOrderState, WORK_ORDER_PAGE_SIZE } from '../config/workOrderWorkspace'
import type { BulkResultItem, ItServiceView, ResourceTab, WorkOrderDialogMode } from '../types/workspace.types'
import { exportWorkOrdersFromState } from '../utils/exportWorkOrdersCsv'
import { getDatePeriodBounds, localDateValue } from '../utils/formatDate'
import { mapWithConcurrency } from '../utils/mapWithConcurrency'
import { Avatar } from '../components/WorkOrderBadges'
import { BulkResultsBanner } from '../components/BulkResultsBanner'
import { ResourceDirectory } from '../components/ResourceDirectory'
import { SeedTestDataDialog } from '../components/SeedTestDataDialog'
import { WorkOrderDetailPanel } from '../components/WorkOrderDetailPanel'
import { WorkOrderQueueView } from '../components/WorkOrderQueueView'
import './WorkOrderWorkspacePage.css'

export default function WorkOrderWorkspacePage() {
  const { inventory, itService, can } = useAccessControl()
  const activeInventoryRole = getRoleDefinition(inventory.activeRoleId)
  const activeItRole = getRoleDefinition(itService.activeRoleId)
  const [state, setState] = useState<WorkOrderStoreState>(emptyWorkOrderState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedWorkOrderKeys, setSelectedWorkOrderKeys] = useState<string[]>([])
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId>('it-service')
  const [view, setView] = useState<ItServiceView>('概览')
  const [inventoryView, setInventoryView] = useState<InventoryView>('overview')
  const [inventoryCreateToken, setInventoryCreateToken] = useState(0)
  const [inventoryResetToken, setInventoryResetToken] = useState(0)
  const [inventoryScanToken, setInventoryScanToken] = useState(0)
  const [inventoryStocktakeToken, setInventoryStocktakeToken] = useState(0)
  const [resourceTab, setResourceTab] = useState<ResourceTab>('employees')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [createdPeriod, setCreatedPeriod] = useState<DatePeriod>('all')
  const [createdAnchorDate, setCreatedAnchorDate] = useState(() => localDateValue(new Date()))
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(WORK_ORDER_PAGE_SIZE)
  const [sort, setSort] = useState<SortState[]>([{ field: 'createTime', direction: 'desc' }])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceEditor, setResourceEditor] = useState<EditableResource | null>(null)
  const [dialog, setDialog] = useState<WorkOrderDialogMode>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null)
  const denyIt = (permission: AppPermission) => {
    setNotice({
      kind: 'error',
      message: `当前 IT 角色无「${APP_PERMISSION_LABELS[permission]}」权限。请到「角色权限」切换角色后重试。`,
    })
  }
  const ensureIt = (permission: AppPermission) => {
    if (can(permission)) return true
    denyIt(permission)
    return false
  }
  const [bulkAction, setBulkAction] = useState<WorkOrderBatchAction | null>(null)
  const [pendingApprovalLoads, setPendingApprovalLoads] = useState<Map<string, number>>(new Map())
  const [pendingApprovalLoadsLoading, setPendingApprovalLoadsLoading] = useState(false)
  const [pendingApprovalLoadsError, setPendingApprovalLoadsError] = useState<string | null>(null)
  const [pendingAssignment, setPendingAssignment] = useState<{ workOrder: WorkOrder; employee: EmployeeOption } | null>(null)
  const [bulkResults, setBulkResults] = useState<BulkResultItem[] | null>(null)
  const [lastBatchInput, setLastBatchInput] = useState<WorkOrderBatchActionInput | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [linkedWorkOrderIds, setLinkedWorkOrderIds] = useState<string[] | null>(null)
  const [linkedFilterLabel, setLinkedFilterLabel] = useState<string | null>(null)
  const [serverFilterNote, setServerFilterNote] = useState<string | null>(null)
  const [seedDialogOpen, setSeedDialogOpen] = useState(false)
  const [seedPhase, setSeedPhase] = useState<TestDataSeedPhase | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setState((current) => ({ ...current, readWarnings: undefined }))
    loadWorkOrderStateFromDataverse()
      .then((nextState) => { if (active) setState(nextState) })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '读取 Dataverse 数据失败。')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshToken])

  const selectedWorkOrder = state.workOrders.find((workOrder) => workOrder.id === selectedId) ?? null
  const activeDepartments = (state.departments ?? []).filter((department) => department.isActive)
  const activeCategories = (state.serviceCategories ?? []).filter((category) => category.isActive)
  const stats = useMemo(() => ({
    total: state.workOrders.length,
    new: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.new).length,
    inProgress: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.inProgress).length,
    resolved: state.workOrders.filter((workOrder) => workOrder.status === WORK_ORDER_STATUS.resolved).length,
  }), [state.workOrders])
  const visibleWorkOrders = useMemo(() => {
    const createdBounds = getDatePeriodBounds(createdPeriod, createdAnchorDate)
    const filtered = state.workOrders.filter((workOrder) => {
    const needle = search.trim().toLocaleLowerCase()
    const matchesSearch = !needle || [workOrder.workOrderNumber, workOrder.workOrderName, workOrder.issueDescription, workOrder.assignedToName ?? '']
      .some((value) => value.toLocaleLowerCase().includes(needle))
    const matchesStatus = statusFilter === 'all' || workOrder.status === Number(statusFilter)
    const matchesPriority = priorityFilter === 'all' || workOrder.priority === Number(priorityFilter)
    const matchesDepartment = departmentFilter === 'all' || workOrder.departmentId === departmentFilter
    const matchesCategory = categoryFilter === 'all' || workOrder.serviceCategoryId === categoryFilter
    const matchesChartLink = linkedWorkOrderIds === null || linkedWorkOrderIds.includes(workOrder.id)
    const createdTime = new Date(workOrder.createTime).getTime()
    const matchesCreated = !createdBounds || (createdTime >= createdBounds.start && createdTime < createdBounds.end)
    const isOverdue = Boolean(workOrder.expectedCompletionTime && ACTIVE_STATUSES.includes(workOrder.status)
      && new Date(workOrder.expectedCompletionTime).getTime() < Date.now())
    return matchesSearch && matchesStatus && matchesPriority && matchesDepartment && matchesCategory && matchesChartLink
      && matchesCreated && (!overdueOnly || isOverdue)
    })
    const activeSort = sort[0]
    if (!activeSort) return filtered
    return filtered.sort((left, right) => {
      const leftValue = left[activeSort.field as keyof WorkOrder]
      const rightValue = right[activeSort.field as keyof WorkOrder]
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'zh-CN', { numeric: true, sensitivity: 'base' })
      return activeSort.direction === 'asc' ? comparison : -comparison
    })
  }, [state.workOrders, search, statusFilter, priorityFilter, departmentFilter, categoryFilter, createdPeriod, createdAnchorDate, overdueOnly, linkedWorkOrderIds, sort])
  const pageCount = Math.max(1, Math.ceil(visibleWorkOrders.length / pageSize))
  const pageRows = visibleWorkOrders.slice((page - 1) * pageSize, page * pageSize)
  const recentActivity = [...state.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 4)
  const filterDefinitions: FilterDefinition[] = [
    { key: 'status', label: '状态', type: 'select', options: [{ value: 'all', label: '全部状态' }, ...workOrderStatusOptions.map((item) => ({ value: String(item.value), label: item.label }))] },
    { key: 'priority', label: '优先级', type: 'select', options: [{ value: 'all', label: '全部优先级' }, ...priorityOptions.map((item) => ({ value: String(item.value), label: item.label }))] },
    { key: 'department', label: '部门', type: 'select', options: [{ value: 'all', label: '全部部门' }, ...(state.departments ?? []).map((item) => ({ value: item.id, label: item.departmentName }))] },
    { key: 'category', label: '类别', type: 'select', options: [{ value: 'all', label: '全部类别' }, ...(state.serviceCategories ?? []).map((item) => ({ value: item.id, label: item.serviceCategoryName }))] },
    { key: 'created', label: '创建日期', type: 'datePeriod' },
  ]
  const filterValues: FilterValues = { status: statusFilter, priority: priorityFilter, department: departmentFilter, category: categoryFilter, created: { period: createdPeriod, anchorDate: createdAnchorDate } }
  const selectedWorkOrders = useMemo(() => state.workOrders.filter((workOrder) => selectedWorkOrderKeys.includes(workOrder.id)), [state.workOrders, selectedWorkOrderKeys])
  const assignmentCandidates = useMemo(() => pendingAssignment ? [pendingAssignment.workOrder] : selectedWorkOrders, [pendingAssignment, selectedWorkOrders])
  const batchEligibleEmployees = (state.employees ?? []).filter((employee) => employee.isActive && employee.isAvailableForOrder)
  const batchActions: BulkAction[] = [
    { id: 'export', label: '导出选中', icon: '↓', disabled: !can('it.view') },
    { id: 'assign', label: '批量调整负责人', icon: '↗', disabled: !can('it.bulk') || !can('it.assign') },
    { id: 'priority', label: '修改优先级', icon: '↑', disabled: !can('it.bulk') || !can('it.edit') },
    { id: 'status', label: '修改状态', icon: '◷', disabled: !can('it.bulk') || !can('it.status') },
    { id: 'cancel', label: '取消工单', icon: '×', disabled: !can('it.bulk') || !can('it.status') },
  ]

  useEffect(() => { setPage((current) => Math.min(current, pageCount)) }, [pageCount])

  const openDialog = (mode: WorkOrderDialogMode) => {
    const permission: AppPermission | null = mode === 'create' || mode === 'create-choice' || mode === 'create-ai'
      ? 'it.create'
      : mode === 'edit' ? 'it.edit'
        : mode === 'assign' ? 'it.assign'
          : mode === 'unassign' ? 'it.unassign'
            : mode === 'status' ? 'it.status'
              : null
    if (permission && !ensureIt(permission)) return
    setDialogError(null)
    setDialog(mode)
  }

  const openCreateChooser = () => {
    setSelectedId(null)
    openDialog('create-choice')
  }

  const runMutation = async (action: () => Promise<void | string>, successMessage: string) => {
    setBusy(true)
    setDialogError(null)
    try {
      const actionMessage = await action()
      setNotice({ kind: 'success', message: actionMessage || successMessage })
      setDialog(null)
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : '操作失败，请重新读取后确认数据。'
      const partial = mutationError instanceof PartialWorkOrderWriteError || message.includes('工单已创建，但')
      setNotice({ kind: 'error', message })
      if (partial) {
        setDialog(null)
        setRefreshToken((value) => value + 1)
      } else {
        setDialogError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const submitResourceEdit = async (input: ResourceEditValues) => {
    if (!ensureIt('it.resources.edit')) return
    setBusy(true)
    setDialogError(null)
    try {
      if (input.type === 'employee') await updateDataverseEmployee(input.id, input.values)
      if (input.type === 'department') await updateDataverseDepartment(input.id, input.values)
      if (input.type === 'category') await updateDataverseServiceCategory(input.id, input.values)
      const resourceName = input.type === 'employee' ? '员工' : input.type === 'department' ? '部门' : '服务类别'
      setResourceEditor(null)
      setNotice({ kind: 'success', message: `${resourceName}信息已保存` })
      setRefreshToken((value) => value + 1)
    } catch (editError) {
      const message = editError instanceof Error ? editError.message : '资源更新失败，请确认数据后重试。'
      setDialogError(message)
    } finally {
      setBusy(false)
    }
  }

  const seedTestData = async () => {
    if (!ensureIt('it.seed')) return
    setBusy(true)
    setNotice(null)
    setSeedPhase('checking')
    try {
      const counts = await seedDataverseITTestData(setSeedPhase)
      setNotice({
        kind: 'success',
        message: `IT 演练数据已写入当前 Dataverse：新增部门 ${counts.departments}、员工 ${counts.employees}、服务类别 ${counts.serviceCategories}、工单 ${counts.workOrders}、派发记录 ${counts.assignments}、历史记录 ${counts.histories}。已存在的演练记录已保留。`,
      })
      setSeedDialogOpen(false)
    } catch (seedError) {
      setNotice({ kind: 'error', message: seedError instanceof Error ? seedError.message : '演练数据写入失败。' })
    } finally {
      setSeedPhase(null)
      setBusy(false)
      setRefreshToken((value) => value + 1)
    }
  }

  const submitWorkOrder = (input: Parameters<typeof createDataverseWorkOrder>[0]) => {
    if (selectedWorkOrder && dialog === 'edit') {
      const department = activeDepartments.find((item) => item.id === input.departmentId)
      const category = activeCategories.find((item) => item.id === input.serviceCategoryId)
      return runMutation(
        () => updateDataverseWorkOrder(selectedWorkOrder, input, department?.departmentName ?? selectedWorkOrder.department, category?.serviceCategoryName ?? selectedWorkOrder.serviceCategoryLabel ?? ''),
        '工单已更新',
      )
    }
    const department = activeDepartments.find((item) => item.id === input.departmentId)
    const category = activeCategories.find((item) => item.id === input.serviceCategoryId)
    if (!department || !category) {
      setDialogError('请选择有效的部门和服务类别。')
      return Promise.resolve()
    }
    return runMutation(
      async () => { await createDataverseWorkOrder(input, department.departmentName, category.serviceCategoryName) },
      '工单已创建',
    )
  }

  const submitAssignment = (employeeId: string, note: string) => {
    if (!selectedWorkOrder) return Promise.resolve()
    const previousState = state
    return runMutation(
      async () => {
        const snapshot = await loadWorkOrderAssignmentSnapshot(selectedWorkOrder.id, employeeId)
        if (!snapshot.employee.isActive || !snapshot.employee.isAvailableForOrder) {
          throw new Error('目标员工当前不可接单，请刷新后重新选择。')
        }
        if (snapshot.employee.maxTaskLoad != null && snapshot.currentLoad >= snapshot.employee.maxTaskLoad) {
          throw new Error(`${snapshot.employee.employeeName} 已达到最大工作负载（${snapshot.currentLoad}/${snapshot.employee.maxTaskLoad}）。`)
        }
        const pendingLoads = await loadPendingAssignmentCounts()
        const projectedLoad = snapshot.currentLoad + (pendingLoads.get(snapshot.employee.id) ?? 0)
        if (snapshot.employee.maxTaskLoad != null && projectedLoad >= snapshot.employee.maxTaskLoad) {
          throw new Error(`${snapshot.employee.employeeName} 的活动工单与待审批申请已占满容量（${projectedLoad}/${snapshot.employee.maxTaskLoad}）。`)
        }
        if (snapshot.workOrder.assignedToId) {
          const submission = await submitAssignmentApprovalRequest(snapshot.workOrder, snapshot.employee, note)
          return `负责人变更审批申请已提交${submission.requestNumber ? `（${submission.requestNumber}）` : ''}；审批完成后将自动更新工单。`
        }
        const nextStatus = snapshot.workOrder.status === WORK_ORDER_STATUS.new || snapshot.workOrder.status === WORK_ORDER_STATUS.inProgress || snapshot.workOrder.status === WORK_ORDER_STATUS.onHold
          ? WORK_ORDER_STATUS.assigned : snapshot.workOrder.status
        const optimisticWorkOrder = {
          ...snapshot.workOrder,
          assignedToId: snapshot.employee.id,
          assignedToName: snapshot.employee.employeeName,
          status: nextStatus,
        }
        setState((current) => ({
          ...current,
          workOrders: current.workOrders.map((item) => item.id === optimisticWorkOrder.id ? optimisticWorkOrder : item),
        }))
        try {
          await assignDataverseWorkOrder(snapshot.workOrder, snapshot.employee, previousState, note, snapshot.currentLoad)
        } catch (assignError) {
          setState(previousState)
          throw assignError
        }
      },
      selectedWorkOrder.assignedToId ? '工单已转派' : '工单已派发',
    )
  }

  const submitUnassign = (note: string) => selectedWorkOrder
    ? runMutation(() => unassignDataverseWorkOrder(selectedWorkOrder, note), '工单已撤派并返回待分派')
    : Promise.resolve()

  const submitStatus = (nextStatus: WorkOrderStatus, note: string) => selectedWorkOrder
    ? runMutation(() => transitionDataverseWorkOrder(selectedWorkOrder, nextStatus, note), `工单状态已更新为${STATUS_LABELS[nextStatus]}`)
    : Promise.resolve()

  const resetListFilters = () => {
    setSearchInput('')
    setSearch('')
    setStatusFilter('all')
    setPriorityFilter('all')
    setDepartmentFilter('all')
    setCategoryFilter('all')
    setCreatedPeriod('all')
    setCreatedAnchorDate(localDateValue(new Date()))
    setOverdueOnly(false)
    setLinkedWorkOrderIds(null)
    setLinkedFilterLabel(null)
    setServerFilterNote(null)
    setPage(1)
  }

  const clearFilters = resetListFilters

  const applyMetricStatusFilter = (nextStatus: 'all' | WorkOrderStatus) => {
    const nextValue = nextStatus === 'all' ? 'all' : String(nextStatus)
    setStatusFilter((current) => (current === nextValue ? 'all' : nextValue))
    setLinkedWorkOrderIds(null)
    setLinkedFilterLabel(null)
    setServerFilterNote(null)
    setOverdueOnly(false)
    setSelectedWorkOrderKeys([])
    setPage(1)
  }

  const handleFilterChange = (values: FilterValues) => {
    const valueFor = (key: string) => typeof values[key] === 'string' ? values[key] as string : 'all'
    setStatusFilter(valueFor('status'))
    setPriorityFilter(valueFor('priority'))
    setDepartmentFilter(valueFor('department'))
    setCategoryFilter(valueFor('category'))
    const createdValue = values.created
    if (createdValue && typeof createdValue === 'object' && !Array.isArray(createdValue) && 'period' in createdValue) {
      setCreatedPeriod(createdValue.period)
      setCreatedAnchorDate(createdValue.anchorDate || localDateValue(new Date()))
    } else {
      setCreatedPeriod('all')
      setCreatedAnchorDate(localDateValue(new Date()))
    }
    setOverdueOnly(false)
    setPage(1)
  }

  const openLinkedWorkOrders = (workOrders: WorkOrder[], filterLabel: string) => {
    const isOverdueLink = filterLabel.includes('逾期')
    resetListFilters()
    setSelectedWorkOrderKeys([])
    setWorkspaceId('it-service')
    setView('工单管理')
    setPage(1)
    if (!isOverdueLink) {
      setLinkedWorkOrderIds(workOrders.map((workOrder) => workOrder.id))
      setLinkedFilterLabel(filterLabel)
      setServerFilterNote(null)
      return
    }
    setLinkedFilterLabel(filterLabel)
    setServerFilterNote('正在通过 Dataverse $filter 读取活动逾期工单…')
    setBusy(true)
    void loadWorkOrdersByServerPreset('active-overdue')
      .then((result) => {
        setState((current) => {
          const byId = new Map(current.workOrders.map((item) => [item.id, item]))
          result.orders.forEach((item) => byId.set(item.id, item))
          return { ...current, workOrders: [...byId.values()] }
        })
        setLinkedWorkOrderIds(result.orders.map((item) => item.id))
        setServerFilterNote(`服务端筛选：Dataverse $filter 活动逾期 · ${result.orders.length} 张`)
      })
      .catch((queryError: unknown) => {
        setLinkedWorkOrderIds(workOrders.map((item) => item.id))
        setServerFilterNote(null)
        setNotice({
          kind: 'error',
          message: `服务端逾期筛选失败，已回退为本地结果。${queryError instanceof Error ? queryError.message : ''}`,
        })
      })
      .finally(() => setBusy(false))
  }

  const handleWorkspaceChange = (nextWorkspace: WorkspaceId) => {
    setWorkspaceId(nextWorkspace)
    setSelectedId(null)
    setDialog(null)
    setBulkAction(null)
    setResourceEditor(null)
    setBulkResults(null)
    setSeedDialogOpen(false)
    setDialogError(null)
    if (nextWorkspace === 'inventory') {
      setInventoryView('overview')
      return
    }
    setView('概览')
  }

  const inventoryViewLabel: Record<InventoryView, string> = {
    overview: '库存概览',
    ledger: '库存台账',
    movements: '出入库',
    locations: '库位',
    alerts: '预警中心',
    stocktake: '库位盘点',
    replenish: '补货计划',
    batches: '批次效期',
    roles: '角色权限',
  }
  const currentPageTitle = workspaceId === 'inventory' ? inventoryViewLabel[inventoryView] : view
  const currentWorkspaceLabel = workspaceId === 'inventory' ? '库存管理工作台' : 'IT 服务运营'

  const exportWorkOrders = (targets: WorkOrder[]) => {
    if (!ensureIt('it.view')) return
    if (targets.length === 0) {
      setNotice({ kind: 'warning', message: '当前没有可导出的工单。' })
      return
    }
    const result = exportWorkOrdersFromState(targets, state)
    setNotice({
      kind: 'success',
      message: `已导出 ${result.workOrderCount} 张工单（含负责人变动 ${result.assignmentCount} 条、历史 ${result.historyCount} 条）。`,
    })
  }

  const requestBatchAction = (actionId: string) => {
    if (actionId === 'export') {
      exportWorkOrders(selectedWorkOrders)
      return
    }
    if (actionId === 'assign' || actionId === 'priority' || actionId === 'status' || actionId === 'cancel') {
      if (!ensureIt('it.bulk')) return
      if (actionId === 'assign' && !ensureIt('it.assign')) return
      if ((actionId === 'priority') && !ensureIt('it.edit')) return
      if ((actionId === 'status' || actionId === 'cancel') && !ensureIt('it.status')) return
      setPendingAssignment(null)
      setBulkAction(actionId)
      if (actionId === 'assign') {
        setPendingApprovalLoadsLoading(true)
        setPendingApprovalLoadsError(null)
        void loadPendingAssignmentCounts()
          .then((counts) => setPendingApprovalLoads(counts))
          .catch((error: unknown) => setPendingApprovalLoadsError(error instanceof Error ? error.message : '读取待审批负责人申请失败。'))
          .finally(() => setPendingApprovalLoadsLoading(false))
      }
    }
  }

  const requestDragAssignment = (workOrder: WorkOrder, employee: EmployeeOption) => {
    if (!ensureIt('it.assign')) return
    setSelectedWorkOrderKeys([])
    setPendingAssignment({ workOrder, employee })
    setBulkAction('assign')
    setPendingApprovalLoadsLoading(true)
    setPendingApprovalLoadsError(null)
    void loadPendingAssignmentCounts()
      .then((counts) => setPendingApprovalLoads(counts))
      .catch((error: unknown) => setPendingApprovalLoadsError(error instanceof Error ? error.message : '读取待审批负责人申请失败。'))
      .finally(() => setPendingApprovalLoadsLoading(false))
  }

  const executeBatchAction = async (input: WorkOrderBatchActionInput, overrideTargets?: WorkOrder[]) => {
    const targets = overrideTargets ?? (pendingAssignment ? [pendingAssignment.workOrder] : selectedWorkOrders)
    setBusy(true)
    setBatchProgress({ done: 0, total: targets.length })
    setLastBatchInput(input)
    const results: BulkResultItem[] = []
    let workloadState = state
    const additionalLoadByEmployee = new Map<string, number>()
    let pendingLoadByEmployee = new Map<string, number>()
    try {
      let snapshotError: unknown = null
      if (input.action === 'assign') {
        try {
          pendingLoadByEmployee = await loadPendingAssignmentCounts()
          setPendingApprovalLoads(pendingLoadByEmployee)
          setPendingApprovalLoadsError(null)
        } catch (error) {
          snapshotError = error
        }
      }
      if (input.action !== 'assign') {
        try {
          workloadState = await loadWorkOrderStateFromDataverse()
          setState(workloadState)
        } catch (error) {
          snapshotError = error
        }
      }

      const markProgress = () => setBatchProgress({ done: results.length, total: targets.length })

      if (input.action === 'assign') {
        for (const workOrder of targets) {
          if (snapshotError) {
            results.push({ workOrder, success: false, message: `未执行：无法刷新 Dataverse 最新状态。${snapshotError instanceof Error ? snapshotError.message : '读取失败'}` })
            markProgress()
            continue
          }
          let latestWorkOrder = workOrder
          try {
            const requestedEmployeeId = pendingAssignment?.employee.id ?? input.employeeId
            if (!requestedEmployeeId) throw new Error('请选择目标员工。')
            const snapshot = await loadWorkOrderAssignmentSnapshot(workOrder.id, requestedEmployeeId)
            latestWorkOrder = snapshot.workOrder
            if (!snapshot.employee.isActive || !snapshot.employee.isAvailableForOrder) {
              throw new Error('目标员工当前不可接单。')
            }
            const assignableStatuses: WorkOrderStatus[] = [WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold]
            if (!assignableStatuses.includes(snapshot.workOrder.status)) {
              throw new Error('当前工单状态不允许派发或转派。')
            }
            const additionalLoad = additionalLoadByEmployee.get(requestedEmployeeId) ?? 0
            const pendingLoad = pendingLoadByEmployee.get(requestedEmployeeId) ?? 0
            const projectedLoad = snapshot.currentLoad + pendingLoad + additionalLoad
            if (snapshot.employee.maxTaskLoad != null && projectedLoad >= snapshot.employee.maxTaskLoad) {
              throw new Error(`${snapshot.employee.employeeName} 已达到最大工作负载或待审批申请占用容量（${projectedLoad}/${snapshot.employee.maxTaskLoad}，当前 ${snapshot.currentLoad} + 待审批 ${pendingLoad} + 本批次 ${additionalLoad}）。`)
            }
            if (snapshot.workOrder.assignedToId) {
              const submission = await submitAssignmentApprovalRequest(snapshot.workOrder, snapshot.employee, input.note)
              additionalLoadByEmployee.set(requestedEmployeeId, additionalLoad + 1)
              results.push({
                workOrder: latestWorkOrder,
                success: true,
                pendingApproval: true,
                message: `审批申请已提交${submission.requestNumber ? `：${submission.requestNumber}` : ''}，等待审批。`,
              })
              markProgress()
              continue
            }
            const nextStatus = latestWorkOrder.status === WORK_ORDER_STATUS.new || latestWorkOrder.status === WORK_ORDER_STATUS.inProgress || latestWorkOrder.status === WORK_ORDER_STATUS.onHold
              ? WORK_ORDER_STATUS.assigned : latestWorkOrder.status
            const updatedWorkOrder = { ...latestWorkOrder, assignedToId: snapshot.employee.id, assignedToName: snapshot.employee.employeeName, status: nextStatus }
            const previousState = workloadState
            workloadState = {
              ...workloadState,
              workOrders: [...workloadState.workOrders.filter((item) => item.id !== updatedWorkOrder.id), updatedWorkOrder],
              employees: [...(workloadState.employees ?? []).filter((item) => item.id !== snapshot.employee.id), snapshot.employee],
            }
            setState(workloadState)
            try {
              await assignDataverseWorkOrder(snapshot.workOrder, snapshot.employee, previousState, input.note, snapshot.currentLoad)
              additionalLoadByEmployee.set(requestedEmployeeId, additionalLoad + 1)
              results.push({ workOrder: latestWorkOrder, success: true, message: '操作成功' })
            } catch (assignError) {
              workloadState = previousState
              setState(previousState)
              throw assignError
            }
          } catch (itemError) {
            results.push({ workOrder: latestWorkOrder, success: false, partial: itemError instanceof PartialWorkOrderWriteError, message: itemError instanceof Error ? itemError.message : '操作失败' })
          }
          markProgress()
        }
      } else {
        const concurrentResults = await mapWithConcurrency(targets, BATCH_CONCURRENCY, async (workOrder) => {
          if (snapshotError) {
            return { workOrder, success: false, message: `未执行：无法刷新 Dataverse 最新状态。${snapshotError instanceof Error ? snapshotError.message : '读取失败'}` } satisfies BulkResultItem
          }
          const cachedWorkOrder = workloadState.workOrders.find((item) => item.id === workOrder.id)
          if (!cachedWorkOrder) {
            return { workOrder, success: false, message: '未执行：工单已不存在或当前身份无权读取。' } satisfies BulkResultItem
          }
          const latestWorkOrder = cachedWorkOrder
          try {
            if (input.action === 'priority') {
              const category = workloadState.serviceCategories?.find((item) => item.id === latestWorkOrder.serviceCategoryId)
              await updateDataverseWorkOrder(latestWorkOrder, {
                workOrderName: latestWorkOrder.workOrderName,
                issueDescription: latestWorkOrder.issueDescription,
                priority: input.priority ?? latestWorkOrder.priority,
                departmentId: latestWorkOrder.departmentId ?? '',
                serviceCategoryId: latestWorkOrder.serviceCategoryId ?? '',
                expectedCompletionTime: latestWorkOrder.expectedCompletionTime,
              }, latestWorkOrder.department, category?.serviceCategoryName ?? latestWorkOrder.serviceCategoryLabel ?? '')
            } else {
              const targetStatus = input.action === 'cancel' ? WORK_ORDER_STATUS.cancelled : input.status
              if (targetStatus === undefined) throw new Error('请选择目标状态。')
              await transitionDataverseWorkOrder(latestWorkOrder, targetStatus, input.note)
            }
            return { workOrder: latestWorkOrder, success: true, message: '操作成功' } satisfies BulkResultItem
          } catch (itemError) {
            return {
              workOrder: latestWorkOrder,
              success: false,
              partial: itemError instanceof PartialWorkOrderWriteError,
              message: itemError instanceof Error ? itemError.message : '操作失败',
            } satisfies BulkResultItem
          }
        }, (done, total) => setBatchProgress({ done, total }))
        results.push(...concurrentResults)
      }
    } finally {
      setBusy(false)
      setBatchProgress(null)
    }
    const succeeded = results.filter((item) => item.success && !item.pendingApproval).length
    const pendingCount = results.filter((item) => item.pendingApproval).length
    const failedCount = results.filter((item) => !item.success && !item.partial).length
    const partialCount = results.filter((item) => item.partial).length
    setBulkResults(results)
    setNotice({ kind: results.some((item) => !item.success) ? 'error' : 'success', message: `批量操作完成：${succeeded} 项已执行，${pendingCount} 项审批申请待处理，${failedCount} 项失败，${partialCount} 项部分成功。` })
    setBulkAction(null)
    setPendingAssignment(null)
    setSelectedWorkOrderKeys(results.filter((item) => !item.success).map((item) => item.workOrder.id))
    setRefreshToken((value) => value + 1)
  }

  const dismissBulkResults = () => {
    setBulkResults(null)
    setLastBatchInput(null)
  }

  const retryFailedBulkResults = () => {
    if (!bulkResults || !lastBatchInput) return
    const failedOrders = bulkResults.filter((item) => !item.success).map((item) => item.workOrder)
    if (failedOrders.length === 0) return
    setBulkResults(null)
    setSelectedWorkOrderKeys(failedOrders.map((item) => item.id))
    void executeBatchAction(lastBatchInput, failedOrders)
  }

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (workspaceId !== 'it-service' || view !== '工单管理' || dialog || bulkAction || resourceEditor || seedDialogOpen) return
        event.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索工单"]')
        input?.focus()
        searchInputRef.current = input
        return
      }
      if (event.key === 'Escape' && !typing) {
        if (dialog || bulkAction || resourceEditor || seedDialogOpen || selectedId) return
        if (selectedWorkOrderKeys.length > 0) {
          event.preventDefault()
          setSelectedWorkOrderKeys([])
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [workspaceId, view, dialog, bulkAction, resourceEditor, seedDialogOpen, selectedId, selectedWorkOrderKeys.length])

  const openInventoryPermissionCheck = (nextView: 'ledger' | 'replenish' | 'stocktake' | 'batches' | 'alerts') => {
    setWorkspaceId('inventory')
    setInventoryView(nextView)
    setSelectedId(null)
    setDialog(null)
    setBulkAction(null)
    setResourceEditor(null)
    setBulkResults(null)
    setSeedDialogOpen(false)
    setDialogError(null)
  }

  const openItPermissionCheck = (nextView: '工单管理' | '派发看板' | '负责人申请' | '资源目录') => {
    setWorkspaceId('it-service')
    setView(nextView)
    setSelectedId(null)
    setDialog(null)
    setBulkAction(null)
    setResourceEditor(null)
    setBulkResults(null)
    setSeedDialogOpen(false)
    setDialogError(null)
  }

  const activeWorkspaceRole = workspaceId === 'inventory' ? activeInventoryRole : activeItRole

  const itServiceNavItems = [{ id: 'workspace', label: '工作台', items: [
    { id: 'overview', path: 'overview', label: '概览', icon: <NavIconOverview /> },
    { id: 'work-orders', path: 'work-orders', label: '工单管理', icon: <NavIconWorkOrders />, badge: stats.total },
    { id: 'dispatch', path: 'dispatch', label: '派发看板', icon: <NavIconDispatch />, badge: stats.new },
    { id: 'org-calendar', path: 'org-calendar', label: '组织日历', icon: <NavIconCalendar /> },
    { id: 'approvals', path: 'approvals', label: '负责人申请', icon: <NavIconApprovals /> },
    { id: 'resources', path: 'resources', label: '资源目录', icon: <NavIconResources />, children: [
      { id: 'resource-employees', path: 'resources/employees', label: '员工', badge: state.employees?.length ?? 0 },
      { id: 'resource-departments', path: 'resources/departments', label: '部门', badge: state.departments?.length ?? 0 },
      { id: 'resource-categories', path: 'resources/categories', label: '服务类别', badge: state.serviceCategories?.length ?? 0 },
    ] },
    { id: 'roles', path: 'roles', label: '角色权限', icon: <NavIconAccess /> },
  ] }]

  const inventoryNavItems = [{ id: 'inventory-workspace', label: '库存工作台', items: [
    { id: 'inv-overview', path: 'inventory/overview', label: '库存概览', icon: <NavIconOverview /> },
    { id: 'inv-ledger', path: 'inventory/ledger', label: '库存台账', icon: <NavIconInventory /> },
    { id: 'inv-movements', path: 'inventory/movements', label: '出入库', icon: <NavIconDispatch /> },
    { id: 'inv-locations', path: 'inventory/locations', label: '库位', icon: <NavIconResources /> },
    { id: 'inv-alerts', path: 'inventory/alerts', label: '预警中心', icon: <NavIconAlerts /> },
    { id: 'inv-replenish', path: 'inventory/replenish', label: '补货计划', icon: <NavIconReplenish /> },
    { id: 'inv-batches', path: 'inventory/batches', label: '批次效期', icon: <NavIconBatches /> },
    { id: 'inv-stocktake', path: 'inventory/stocktake', label: '库位盘点', icon: <NavIconStocktake /> },
    { id: 'inv-roles', path: 'inventory/roles', label: '角色权限', icon: <NavIconAccess /> },
  ] }]

  const activePath = workspaceId === 'inventory'
    ? `inventory/${inventoryView}`
    : view === '概览' ? 'overview'
      : view === '工单管理' ? 'work-orders'
        : view === '派发看板' ? 'dispatch'
          : view === '组织日历' ? 'org-calendar'
            : view === '资源目录' ? `resources/${resourceTab}`
              : view === '角色权限' ? 'roles'
                : 'approvals'

  return <AppLayout sidebarCollapsed={sidebarCollapsed} onSidebarCollapseChange={setSidebarCollapsed}
    sidebar={<AppSidebar
      items={workspaceId === 'inventory' ? inventoryNavItems : itServiceNavItems}
      activePath={activePath}
      collapsed={sidebarCollapsed}
      onNavigate={(path) => {
        if (workspaceId === 'inventory') {
          if (path === 'inventory/overview') setInventoryView('overview')
          else if (path === 'inventory/ledger') setInventoryView('ledger')
          else if (path === 'inventory/movements') setInventoryView('movements')
          else if (path === 'inventory/locations') setInventoryView('locations')
          else if (path === 'inventory/alerts') setInventoryView('alerts')
          else if (path === 'inventory/replenish') setInventoryView('replenish')
          else if (path === 'inventory/batches') setInventoryView('batches')
          else if (path === 'inventory/stocktake') setInventoryView('stocktake')
          else if (path === 'inventory/roles') setInventoryView('roles')
          return
        }
        if (path === 'resources') {
          setResourceTab('employees')
          setView('资源目录')
        } else if (path === 'resources/employees' || path === 'resources/departments' || path === 'resources/categories') {
          setResourceTab(path.slice('resources/'.length) as ResourceTab)
          setView('资源目录')
        } else if (path === 'roles') {
          setSelectedId(null)
          setView('角色权限')
        } else if (path === 'org-calendar') {
          setSelectedId(null)
          setView('组织日历')
        } else {
          setView(path === 'dispatch' ? '派发看板' : path === 'work-orders' ? '工单管理' : path === 'approvals' ? '负责人申请' : '概览')
        }
      }}
      brand={<div className="brand-lockup"><div className="brand-mark"><span /><span /><span /><span /></div><div><strong>opsdesk</strong><small>OPERATIONS WORKBENCH</small></div></div>}
      workspace={<WorkspaceSwitcher value={workspaceId} onChange={handleWorkspaceChange} />}
      footer={<div className="profile-card"><div className="profile-avatar">A</div><div><strong>{activeWorkspaceRole.name}</strong><span>{workspaceId === 'inventory' ? '库存测试角色 · 可切换' : 'IT 测试角色 · 可切换'}</span></div></div>}
    />}
    header={<AppHeader breadcrumbs={<div className="breadcrumbs"><span>{currentWorkspaceLabel}</span><b>/</b><strong>{currentPageTitle}</strong></div>}
      actions={<div className="topbar-actions"><Avatar small name="A" /></div>} />}
  >
      {workspaceId === 'it-service' && !loading && state.readWarnings && state.readWarnings.length > 0 && <div className="dataverse-read-warning" role="status">
        <strong>部分辅助数据源读取失败：</strong> {state.readWarnings.join(' ')}
      </div>}
      {workspaceId === 'it-service' && error && state.workOrders.length > 0 && <div className="dataverse-read-warning warning-error" role="alert"><strong>刷新失败：</strong> {error}</div>}
      {notice && <Toast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
      {workspaceId === 'it-service' && bulkResults && <BulkResultsBanner
        results={bulkResults}
        busy={busy}
        lastBatchInput={lastBatchInput}
        onRetryFailed={retryFailedBulkResults}
        onDismiss={dismissBulkResults}
      />}

      <PageContainer
        eyebrow={workspaceId === 'inventory' ? 'INVENTORY OPERATIONS' : 'SERVICE OPERATIONS'}
        title={currentPageTitle}
        description={workspaceId === 'inventory'
          ? (inventoryView === 'overview' ? '库存估值、预警、补货与盘点总览，突出实物库存能力。'
            : inventoryView === 'ledger' ? '检索筛选台账，执行入库、领用、调拨、预留与批量操作。'
              : inventoryView === 'movements' ? '查看入库、领用、调拨、调整与预留等完整流水。'
                : inventoryView === 'locations' ? '按库位查看容量利用率、管理员与风险项。'
                  : inventoryView === 'alerts' ? '缺货、警戒线、批次临期/过期与库位超容预警。'
                    : inventoryView === 'replenish' ? '按警戒线生成补货建议量与采购估价。'
                      : inventoryView === 'batches' ? '批次追溯与临期优先出库管理。'
                        : inventoryView === 'roles' ? '管理库存工作台独立测试角色，验证库存按钮门控。'
                          : '库位实物盘点：录入实盘、复核差异并过账调整。')
          : view === '概览' ? '查看工单规模、SLA 风险、工程师负载与处理趋势。'
            : view === '工单管理' ? '管理工单字段、跨记录操作和业务历史。'
              : view === '派发看板' ? '按实时工作负载和接单状态安排工程师任务。'
                : view === '组织日历' ? '基于 Graph 组织日历查看工程师日 / 周 / 月忙闲，辅助派单决策。'
                  : view === '负责人申请' ? '集中查看负责人变更申请、审批状态和处理结果。'
                    : view === '角色权限' ? '管理 IT 服务工作台独立测试角色（与库存角色互不影响），并可跳转本台页面验证门控。'
                      : '核对员工、部门与服务类别的当前 Dataverse 字段。'}
        actions={workspaceId === 'inventory' ? <div className="page-header-actions">
          <span className="inventory-role-chip" title="当前库存测试角色">角色 · {activeInventoryRole.name}</span>
          <button className="button button-quiet" type="button" onClick={() => setInventoryView('roles')}>角色权限</button>
          <button className="button button-quiet" type="button" onClick={() => setInventoryResetToken((value) => value + 1)}>重置样例数据</button>
          <button
            className="button button-quiet"
            type="button"
            disabled={!can('inventory.scan')}
            title={!can('inventory.scan') ? '当前角色无扫码权限' : undefined}
            onClick={() => setInventoryScanToken((value) => value + 1)}
          >SKU 扫码</button>
          {inventoryView === 'stocktake'
            ? <button
              className="button button-primary create-button"
              type="button"
              disabled={!can('inventory.stocktake')}
              title={!can('inventory.stocktake') ? '当前角色无盘点权限' : undefined}
              onClick={() => setInventoryStocktakeToken((value) => value + 1)}
            >发起盘点</button>
            : inventoryView !== 'roles' && <button
              className="button button-primary create-button"
              type="button"
              disabled={!can('inventory.create')}
              title={!can('inventory.create') ? '当前角色无新建权限' : undefined}
              onClick={() => {
                setInventoryView('ledger')
                setInventoryCreateToken((value) => value + 1)
              }}
            ><span className="plus-mark">＋</span>新建物资</button>}
        </div> : workspaceId === 'it-service' ? <div className="page-header-actions">
          <span className="inventory-role-chip" title="当前 IT 测试角色">角色 · {activeItRole.name}</span>
          <button className="button button-quiet" type="button" onClick={() => setView('角色权限')}>角色权限</button>
          {view !== '角色权限' && <>
            <button
              className="button button-quiet seed-data-trigger"
              type="button"
              onClick={() => {
                if (!ensureIt('it.seed')) return
                setSeedDialogOpen(true)
              }}
              disabled={loading || busy || !can('it.seed')}
              title={!can('it.seed') ? '当前角色无写入演练数据权限' : undefined}
            >添加 IT 演练数据</button>
            <button className="button button-quiet" type="button" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading || busy}>{loading ? '读取中…' : '重新读取'}</button>
            {(view === '概览' || view === '工单管理') && <button
              className="button button-primary create-button"
              disabled={busy || !can('it.create') || activeDepartments.length === 0 || activeCategories.length === 0}
              title={!can('it.create')
                ? '当前角色无新建工单权限'
                : activeDepartments.length === 0 || activeCategories.length === 0
                  ? '需要有效的部门和服务类别记录'
                  : undefined}
              onClick={openCreateChooser}
            ><span className="plus-mark">＋</span>新建工单</button>}
          </>}
        </div> : undefined}>

        {workspaceId === 'inventory' && inventoryView === 'roles' && <RolePermissionPage
          domain="inventory"
          onNavigateInventory={openInventoryPermissionCheck}
        />}
        {workspaceId === 'it-service' && view === '角色权限' && <RolePermissionPage
          domain="it-service"
          onNavigateItService={openItPermissionCheck}
        />}
        {workspaceId === 'inventory' && inventoryView !== 'roles' && <InventoryWorkspacePanel
          view={inventoryView}
          createRequestToken={inventoryCreateToken}
          resetRequestToken={inventoryResetToken}
          scanRequestToken={inventoryScanToken}
          stocktakeRequestToken={inventoryStocktakeToken}
          onNavigate={setInventoryView}
        />}
        {workspaceId === 'it-service' && view === '概览' && <WorkOrderOperationsDashboard loading={loading} error={error}
          onRetry={() => setRefreshToken((value) => value + 1)} workOrders={state.workOrders} employees={state.employees ?? []}
          departments={state.departments ?? []} serviceCategories={state.serviceCategories ?? []} onOpenWorkOrders={openLinkedWorkOrders} />}
        {workspaceId === 'it-service' && view === '工单管理' && <WorkOrderQueueView
          state={state}
          loading={loading}
          error={error}
          stats={stats}
          recentActivity={recentActivity}
          visibleWorkOrders={visibleWorkOrders}
          pageRows={pageRows}
          page={page}
          pageSize={pageSize}
          sort={sort}
          searchInput={searchInput}
          filterDefinitions={filterDefinitions}
          filterValues={filterValues}
          selectedWorkOrderKeys={selectedWorkOrderKeys}
          selectedWorkOrders={selectedWorkOrders}
          batchActions={batchActions}
          busy={busy}
          canCreate={can('it.create')}
          statusFilter={statusFilter}
          overdueOnly={overdueOnly}
          linkedWorkOrderIds={linkedWorkOrderIds}
          linkedFilterLabel={linkedFilterLabel}
          serverFilterNote={serverFilterNote}
          onSearchInputChange={(value) => { setSearchInput(value); setPage(1) }}
          onSearch={setSearch}
          onClearSearch={() => { setSearch(''); setPage(1) }}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          onMetricStatusFilter={applyMetricStatusFilter}
          onSelectWorkOrder={(workOrderId) => setSelectedId(workOrderId)}
          onSelectionChange={setSelectedWorkOrderKeys}
          onSortChange={(nextSort) => { setSort(nextSort); setPage(1) }}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          onBatchAction={requestBatchAction}
          onClearSelection={() => setSelectedWorkOrderKeys([])}
          onCreate={openCreateChooser}
          onRetryLoad={() => setRefreshToken((value) => value + 1)}
          onClearLinkedFilter={() => { setLinkedWorkOrderIds(null); setLinkedFilterLabel(null); setServerFilterNote(null); setPage(1) }}
          onClearServerFilter={() => { setServerFilterNote(null); setLinkedWorkOrderIds(null); setLinkedFilterLabel(null); setPage(1) }}
          onClearOverdueOnly={() => setOverdueOnly(false)}
        />}
        {workspaceId === 'it-service' && view === '派发看板' && <WorkOrderDispatchBoard
          workOrders={state.workOrders}
          employees={state.employees ?? []}
          canAssign={can('it.assign')}
          onRequestAssignment={requestDragAssignment}
          onOpenWorkOrder={(workOrder) => setSelectedId(workOrder.id)}
        />}
        {workspaceId === 'it-service' && view === '组织日历' && <OrgCalendarPage
          employees={state.employees ?? []}
          workOrders={state.workOrders}
          loadingEmployees={loading}
        />}
        {workspaceId === 'it-service' && view === '负责人申请' && <AssignmentApprovalRequestsPage active refreshToken={refreshToken}
          onRefresh={() => setRefreshToken((value) => value + 1)}
          onOpenWorkOrder={(workOrderId) => { setSelectedId(workOrderId); setView('工单管理') }} />}
        {workspaceId === 'it-service' && view === '资源目录' && <ResourceDirectory
          state={state}
          tab={resourceTab}
          query={resourceSearch}
          loading={loading}
          canEdit={can('it.resources.edit')}
          onQueryChange={setResourceSearch}
          onEditResource={(resource) => {
            if (!ensureIt('it.resources.edit')) return
            setDialogError(null)
            setResourceEditor(resource)
          }}
        />}
      </PageContainer>

    {workspaceId === 'it-service' && selectedWorkOrder && <WorkOrderDetailPanel
      key={`${selectedWorkOrder.id}-${refreshToken}`}
      workOrder={selectedWorkOrder}
      state={state}
      disabled={busy}
      canEdit={can('it.edit')}
      canAssignAction={can('it.assign')}
      canUnassignAction={can('it.unassign')}
      canChangeStatus={can('it.status')}
      onClose={() => setSelectedId(null)}
      onEdit={() => openDialog('edit')}
      onAssign={() => openDialog('assign')}
      onUnassign={() => openDialog('unassign')}
      onChangeStatus={() => openDialog('status')}
    />}

    <CreateWorkOrderChoiceDialog
      open={dialog === 'create-choice'}
      busy={busy}
      onClose={() => !busy && setDialog(null)}
      onManual={() => openDialog('create')}
      onAi={() => openDialog('create-ai')}
    />
    <AiWorkOrderCreateDialog
      open={dialog === 'create-ai'}
      departments={state.departments ?? []}
      categories={state.serviceCategories ?? []}
      busy={busy}
      error={dialogError}
      onClose={() => !busy && setDialog(null)}
      onSubmit={submitWorkOrder}
    />
    <WorkOrderFormDialog open={dialog === 'create' || dialog === 'edit'} workOrder={dialog === 'edit' ? selectedWorkOrder : null}
      departments={state.departments ?? []} categories={state.serviceCategories ?? []} busy={busy} error={dialogError}
      onClose={() => !busy && setDialog(null)} onSubmit={submitWorkOrder} />
    <AssignmentDialog open={dialog === 'assign'} workOrder={selectedWorkOrder} state={state} busy={busy} error={dialogError}
      onClose={() => !busy && setDialog(null)} onSubmit={submitAssignment} />
    <NoteDialog open={dialog === 'unassign'} title="撤销派发" subtitle={selectedWorkOrder?.workOrderNumber ?? ''} label="撤派原因"
      busy={busy} error={dialogError} onClose={() => !busy && setDialog(null)} onSubmit={submitUnassign} />
    <StatusDialog open={dialog === 'status'} workOrder={selectedWorkOrder} busy={busy} error={dialogError}
      onClose={() => !busy && setDialog(null)} onSubmit={submitStatus} />
    <WorkOrderBatchActionDialog open={bulkAction !== null} action={bulkAction} workOrders={assignmentCandidates}
      allWorkOrders={state.workOrders} employees={batchEligibleEmployees} busy={busy} error={null}
      pendingApprovalLoads={pendingApprovalLoads} pendingApprovalLoadsLoading={pendingApprovalLoadsLoading} pendingApprovalLoadsError={pendingApprovalLoadsError}
      lockedEmployee={pendingAssignment?.employee} progress={batchProgress}
      onClose={() => { if (!busy) { setBulkAction(null); setPendingAssignment(null); setBatchProgress(null) } }}
      onSubmit={(input) => executeBatchAction(input)} />
    <ResourceEditDialog resource={resourceEditor} employees={state.employees ?? []} departments={state.departments ?? []}
      busy={busy} error={dialogError} onClose={() => { if (!busy) { setResourceEditor(null); setDialogError(null) } }} onSubmit={submitResourceEdit} />

    <SeedTestDataDialog
      open={seedDialogOpen}
      busy={busy}
      seedPhase={seedPhase}
      onClose={() => setSeedDialogOpen(false)}
      onConfirm={() => { void seedTestData() }}
    />
  </AppLayout>
}
