import type { IOperationResult } from '@microsoft/power-apps/data'
import { Cr590_assignmentsService } from '../../../generated/services/Cr590_assignmentsService'
import { Cr590_servicecategoriesService } from '../../../generated/services/Cr590_servicecategoriesService'
import { Cr590_table1sService } from '../../../generated/services/Cr590_table1sService'
import { Cr590_table2sService } from '../../../generated/services/Cr590_table2sService'
import { Cr590_tablesService } from '../../../generated/services/Cr590_tablesService'
import { Cr590_workordersService } from '../../../generated/services/Cr590_workordersService'
import type { Cr590_assignmentsBase } from '../../../generated/models/Cr590_assignmentsModel'
import type { Cr590_servicecategoriesBase, Cr590_servicecategoriescr590_defaultpriority } from '../../../generated/models/Cr590_servicecategoriesModel'
import type { Cr590_table1sBase } from '../../../generated/models/Cr590_table1sModel'
import type { Cr590_table2sBase, Cr590_table2scr590_gender } from '../../../generated/models/Cr590_table2sModel'
import type { Cr590_tablesBase } from '../../../generated/models/Cr590_tablesModel'
import type { Cr590_workordersBase } from '../../../generated/models/Cr590_workordersModel'
import { loadWorkOrderStateFromDataverse } from './dataverseWorkOrderRepository'
import {
  PRIORITY,
  STATUS_LABELS,
  WORK_ORDER_STATUS,
  type DepartmentOption,
  type EmployeeOption,
  type Priority,
  type ServiceCategoryOption,
  type WorkOrder,
  type WorkOrderEvent,
  type WorkOrderStatus,
} from '../types/workOrder.types'

export type TestDataSeedPhase = 'checking' | 'resources' | 'work-orders' | 'history'
export type TestDataSeedCounts = {
  departments: number
  employees: number
  serviceCategories: number
  workOrders: number
  assignments: number
  histories: number
}

const MARKER = '[IT演练]'
const ASSIGNMENT_NOTE = 'IT演练样例初始派发'
const ENTITY_SETS = {
  departments: 'cr590_table1s',
  employees: 'cr590_table2s',
  serviceCategories: 'cr590_servicecategories',
  workOrders: 'cr590_workorders',
} as const

type DepartmentSeed = { code: string; name: string; description: string; managerEmail: string; establishedYearsAgo: number }
type EmployeeSeed = {
  email: string
  name: string
  departmentCode: string
  skills: string
  maxTaskLoad: number
  available: boolean
  active: boolean
  hireYearsAgo: number
}
type CategorySeed = {
  code: string
  name: string
  departmentCode: string
  priority: Priority
  description: string
}
type WorkOrderSeed = {
  title: string
  description: string
  priority: Priority
  status: WorkOrderStatus
  departmentCode: string
  categoryCode: string
  assignedEmail: string | null
  createdDaysAgo: number
  dueInHours: number | null
  resolution?: string
}

const departmentsSeed: DepartmentSeed[] = [
  { code: 'ITTEST-SD', name: `${MARKER} IT 服务台`, description: '一线服务请求、账号权限和办公软件支持。', managerEmail: 'itdemo.linchen@example.com', establishedYearsAgo: 5 },
  { code: 'ITTEST-INFRA', name: `${MARKER} 基础架构与网络`, description: '负责网络、VPN、服务器和基础平台可用性。', managerEmail: 'itdemo.zhouning@example.com', establishedYearsAgo: 7 },
  { code: 'ITTEST-ENDPOINT', name: `${MARKER} 终端与会议室`, description: '负责电脑、外设、会议室和终端设备支持。', managerEmail: 'itdemo.chenke@example.com', establishedYearsAgo: 4 },
]

const employeesSeed: EmployeeSeed[] = [
  { email: 'itdemo.linchen@example.com', name: `${MARKER} 林晨`, departmentCode: 'ITTEST-SD', skills: 'Microsoft 365、账号解锁、权限申请、软件安装', maxTaskLoad: 5, available: true, active: true, hireYearsAgo: 4 },
  { email: 'itdemo.wangjiamin@example.com', name: `${MARKER} 王嘉敏`, departmentCode: 'ITTEST-SD', skills: '服务台、邮箱、企业应用、用户沟通', maxTaskLoad: 5, available: true, active: true, hireYearsAgo: 3 },
  { email: 'itdemo.sunhao@example.com', name: `${MARKER} 孙浩`, departmentCode: 'ITTEST-SD', skills: '账号权限、入离职、身份验证', maxTaskLoad: 4, available: false, active: true, hireYearsAgo: 2 },
  { email: 'itdemo.zhouning@example.com', name: `${MARKER} 周宁`, departmentCode: 'ITTEST-INFRA', skills: 'VPN、DNS、交换网络、服务器监控', maxTaskLoad: 4, available: true, active: true, hireYearsAgo: 6 },
  { email: 'itdemo.zhaowenbo@example.com', name: `${MARKER} 赵文博`, departmentCode: 'ITTEST-INFRA', skills: '网络安全、服务器、备份恢复', maxTaskLoad: 4, available: true, active: true, hireYearsAgo: 5 },
  { email: 'itdemo.chenke@example.com', name: `${MARKER} 陈可`, departmentCode: 'ITTEST-ENDPOINT', skills: 'Windows、笔记本、打印机、会议室设备', maxTaskLoad: 4, available: true, active: true, hireYearsAgo: 3 },
  { email: 'itdemo.liuyutong@example.com', name: `${MARKER} 刘雨桐`, departmentCode: 'ITTEST-ENDPOINT', skills: '终端部署、资产盘点、音视频会议', maxTaskLoad: 4, available: true, active: true, hireYearsAgo: 2 },
  { email: 'itdemo.xutao@example.com', name: `${MARKER} 徐涛（停用样例）`, departmentCode: 'ITTEST-ENDPOINT', skills: '终端设备、硬件维修', maxTaskLoad: 3, available: false, active: false, hireYearsAgo: 1 },
]

const categoriesSeed: CategorySeed[] = [
  { code: 'ITTEST-ACCOUNT', name: `${MARKER} 账号与权限`, departmentCode: 'ITTEST-SD', priority: PRIORITY.high, description: '账号开通、解锁、组权限和访问申请。' },
  { code: 'ITTEST-M365', name: `${MARKER} 邮箱与 Microsoft 365`, departmentCode: 'ITTEST-SD', priority: PRIORITY.high, description: 'Outlook、Teams、OneDrive 和 Microsoft 365 客户端。' },
  { code: 'ITTEST-SOFTWARE', name: `${MARKER} 软件安装与配置`, departmentCode: 'ITTEST-SD', priority: PRIORITY.medium, description: '经批准的软件安装、更新和客户端配置。' },
  { code: 'ITTEST-NETWORK', name: `${MARKER} 网络与 VPN`, departmentCode: 'ITTEST-INFRA', priority: PRIORITY.high, description: '有线/无线网络、VPN、DNS 和远程访问。' },
  { code: 'ITTEST-SERVER', name: `${MARKER} 服务器与平台`, departmentCode: 'ITTEST-INFRA', priority: PRIORITY.high, description: '服务器、共享存储、备份及业务平台可用性。' },
  { code: 'ITTEST-ENDPOINT', name: `${MARKER} 电脑与终端`, departmentCode: 'ITTEST-ENDPOINT', priority: PRIORITY.medium, description: '台式机、笔记本、外设和终端性能问题。' },
  { code: 'ITTEST-MEETING', name: `${MARKER} 会议室与协作设备`, departmentCode: 'ITTEST-ENDPOINT', priority: PRIORITY.high, description: '会议室屏幕、摄像头、麦克风和投屏设备。' },
  { code: 'ITTEST-SECURITY', name: `${MARKER} 安全事件`, departmentCode: 'ITTEST-INFRA', priority: PRIORITY.high, description: '钓鱼邮件、可疑登录和终端安全事件。' },
]

const workOrdersSeed: WorkOrderSeed[] = [
  { title: '新员工无法登录 Microsoft 365', description: '新员工已完成入职，但 Outlook 和 Teams 均提示账号无效。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-M365', assignedEmail: null, createdDaysAgo: 0, dueInHours: 8 },
  { title: '财务共享盘读取权限申请', description: '申请加入财务项目共享盘，只需读取权限。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-ACCOUNT', assignedEmail: null, createdDaysAgo: 0, dueInHours: 24 },
  { title: '会议室无线投屏无信号', description: '三楼会议室投屏器显示已连接，但大屏没有画面。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-MEETING', assignedEmail: null, createdDaysAgo: 1, dueInHours: -3 },
  { title: 'VPN 登录后频繁断开', description: '远程办公期间 VPN 每隔十分钟断开，需要重新认证。', priority: PRIORITY.critical, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-NETWORK', assignedEmail: null, createdDaysAgo: 1, dueInHours: -2 },
  { title: '笔记本蓝屏并自动重启', description: '设备运行大型表格时出现蓝屏，重启后可以暂时恢复。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-ENDPOINT', assignedEmail: null, createdDaysAgo: 2, dueInHours: 10 },
  { title: '项目系统账号被锁定', description: '连续登录失败后项目系统账号被锁，用户无法提交审批。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-ACCOUNT', assignedEmail: null, createdDaysAgo: 2, dueInHours: -12 },
  { title: '开发环境安装批准的运行时', description: '为新开发电脑安装公司批准的运行时和命令行工具。', priority: PRIORITY.low, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-SOFTWARE', assignedEmail: null, createdDaysAgo: 3, dueInHours: 48 },
  { title: '共享打印机无法打印', description: '二楼共享打印机队列停滞，多个用户的任务未输出。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-ENDPOINT', assignedEmail: null, createdDaysAgo: 4, dueInHours: 20 },
  { title: '收到疑似钓鱼邮件', description: '员工收到要求立即重置密码的邮件，发件域名与公司不符。', priority: PRIORITY.critical, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-SECURITY', assignedEmail: null, createdDaysAgo: 5, dueInHours: -1 },
  { title: 'OneDrive 文件同步停滞', description: '桌面客户端持续显示正在同步，但文件未出现在云端。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.new, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-M365', assignedEmail: null, createdDaysAgo: 6, dueInHours: 30 },
  { title: '离职员工账号回收核对', description: '请核对离职账号、邮箱和项目组权限的回收情况。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.assigned, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-ACCOUNT', assignedEmail: 'itdemo.linchen@example.com', createdDaysAgo: 1, dueInHours: 12 },
  { title: '分支办公室 Wi-Fi 覆盖不稳定', description: '靠近会议区的无线信号较弱，视频会议偶发卡顿。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.assigned, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-NETWORK', assignedEmail: 'itdemo.zhouning@example.com', createdDaysAgo: 2, dueInHours: 24 },
  { title: '新电脑配置标准办公软件', description: '为替换设备安装浏览器、Office 和终端管理客户端。', priority: PRIORITY.low, status: WORK_ORDER_STATUS.assigned, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-SOFTWARE', assignedEmail: 'itdemo.chenke@example.com', createdDaysAgo: 4, dueInHours: 40 },
  { title: 'Outlook 搜索无法返回新邮件', description: '客户端可以收发邮件，但搜索最近一周邮件没有结果。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.inProgress, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-M365', assignedEmail: 'itdemo.wangjiamin@example.com', createdDaysAgo: 0, dueInHours: 5 },
  { title: '开发账号无法访问测试环境', description: '用户已有开发账号，但访问测试环境时收到授权错误。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.inProgress, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-ACCOUNT', assignedEmail: 'itdemo.linchen@example.com', createdDaysAgo: 1, dueInHours: -4 },
  { title: 'VPN 客户端升级后无法连接', description: '客户端升级后握手失败，已收集版本号和连接日志。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.inProgress, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-NETWORK', assignedEmail: 'itdemo.zhouning@example.com', createdDaysAgo: 2, dueInHours: 9 },
  { title: '会议室摄像头画面偏色', description: '会议室摄像头画面偏绿，重插 USB 后问题仍然存在。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.inProgress, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-MEETING', assignedEmail: 'itdemo.chenke@example.com', createdDaysAgo: 3, dueInHours: 16 },
  { title: '笔记本磁盘空间不足', description: '系统盘剩余空间不足 2GB，影响更新和本地构建。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.inProgress, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-ENDPOINT', assignedEmail: 'itdemo.liuyutong@example.com', createdDaysAgo: 6, dueInHours: -8 },
  { title: '共享存储目录权限继承异常', description: '新建子目录没有继承项目组权限，需确认目录 ACL。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.onHold, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-SERVER', assignedEmail: 'itdemo.zhouning@example.com', createdDaysAgo: 2, dueInHours: 20 },
  { title: '企业应用单点登录间歇失败', description: '同一浏览器中部分用户需要重复登录企业应用。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.onHold, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-ACCOUNT', assignedEmail: 'itdemo.wangjiamin@example.com', createdDaysAgo: 5, dueInHours: -16 },
  { title: '服务器备份任务等待存储确认', description: '备份任务已重试，正在等待存储团队确认目标空间。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.onHold, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-SERVER', assignedEmail: 'itdemo.zhaowenbo@example.com', createdDaysAgo: 8, dueInHours: 24 },
  { title: 'Teams 麦克风权限已恢复', description: '新策略阻止桌面端访问麦克风，更新策略后已完成验证。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.resolved, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-M365', assignedEmail: 'itdemo.wangjiamin@example.com', createdDaysAgo: 2, dueInHours: -1, resolution: '修正应用隐私权限并重新登录验证，Teams 麦克风正常。' },
  { title: '打印机驱动冲突已修复', description: '新驱动与旧版本冲突，清理旧驱动后打印恢复正常。', priority: PRIORITY.low, status: WORK_ORDER_STATUS.resolved, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-ENDPOINT', assignedEmail: 'itdemo.liuyutong@example.com', createdDaysAgo: 7, dueInHours: -20, resolution: '移除旧驱动并部署标准驱动，完成测试页打印。' },
  { title: '邮箱别名配置已完成', description: '按部门负责人确认结果为共享邮箱添加了别名。', priority: PRIORITY.low, status: WORK_ORDER_STATUS.resolved, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-M365', assignedEmail: 'itdemo.linchen@example.com', createdDaysAgo: 11, dueInHours: -30, resolution: '添加别名并验证收发，结果已通知申请人。' },
  { title: '文件服务器磁盘告警已处理', description: '文件服务器磁盘空间告警，经清理临时文件后已恢复。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.resolved, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-SERVER', assignedEmail: 'itdemo.zhaowenbo@example.com', createdDaysAgo: 12, dueInHours: -36, resolution: '清理过期临时文件并确认容量告警解除，监控持续正常。' },
  { title: '安全补丁部署并关闭', description: '测试组确认补丁安装和业务兼容性正常。', priority: PRIORITY.high, status: WORK_ORDER_STATUS.closed, departmentCode: 'ITTEST-INFRA', categoryCode: 'ITTEST-SECURITY', assignedEmail: 'itdemo.zhaowenbo@example.com', createdDaysAgo: 13, dueInHours: -48, resolution: '按变更窗口完成补丁部署，监控无异常。' },
  { title: '会议室显示器更换完成', description: '旧显示器接口损坏，替换设备已由会议支持人员验收。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.closed, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-MEETING', assignedEmail: 'itdemo.chenke@example.com', createdDaysAgo: 16, dueInHours: -72, resolution: '更换显示器并验证 HDMI 和无线投屏功能。' },
  { title: 'OneDrive 同步客户端修复并关闭', description: '重置客户端缓存后文件同步恢复，申请人已确认。', priority: PRIORITY.medium, status: WORK_ORDER_STATUS.closed, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-M365', assignedEmail: 'itdemo.wangjiamin@example.com', createdDaysAgo: 20, dueInHours: -96, resolution: '清理损坏缓存并重新建立同步，文件状态正常。' },
  { title: '旧设备回收申请已取消', description: '申请人确认设备仍需保留，取消本次回收安排。', priority: PRIORITY.low, status: WORK_ORDER_STATUS.cancelled, departmentCode: 'ITTEST-ENDPOINT', categoryCode: 'ITTEST-ENDPOINT', assignedEmail: null, createdDaysAgo: 22, dueInHours: null },
  { title: '测试账号权限申请重复提交', description: '用户已通过另一张工单获得权限，重复申请不再处理。', priority: PRIORITY.low, status: WORK_ORDER_STATUS.cancelled, departmentCode: 'ITTEST-SD', categoryCode: 'ITTEST-ACCOUNT', assignedEmail: null, createdDaysAgo: 30, dueInHours: null },
]

const zeroCounts = (): TestDataSeedCounts => ({ departments: 0, employees: 0, serviceCategories: 0, workOrders: 0, assignments: 0, histories: 0 })

function unwrap<T>(result: IOperationResult<T>, source: string): T {
  if (!result.success) {
    const error = result.error
    const message = error instanceof Error ? error.message
      : typeof error === 'string' ? error
        : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
          ? error.message : '运行时未提供错误详情'
    throw new Error(`Dataverse ${source} 写入失败：${message}`)
  }
  return result.data
}

function dateOffset(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString()
}

function dateOnlyOffset(years: number): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`
}

function eventTime(workOrder: WorkOrder, hoursAfterCreate: number): string {
  const base = new Date(workOrder.createTime).getTime()
  return new Date(Math.min(Date.now(), base + hoursAfterCreate * 60 * 60_000)).toISOString()
}

function historyStatus(status: WorkOrderStatus): number {
  if (status === WORK_ORDER_STATUS.cancelled) return 326990003
  if (status === WORK_ORDER_STATUS.inProgress || status === WORK_ORDER_STATUS.onHold) return 326990001
  if (status === WORK_ORDER_STATUS.resolved || status === WORK_ORDER_STATUS.closed) return 326990002
  return 326990000
}

function makeWorkOrderSeedRecord(
  spec: WorkOrderSeed,
  departmentId: string,
  categoryId: string,
  employeeId: string | null,
): Omit<Cr590_workordersBase, 'cr590_workorderid'> {
  const createdAt = dateOffset(spec.createdDaysAgo)
  const expectedCompletionTime = spec.dueInHours === null ? undefined : new Date(Date.now() + spec.dueInHours * 60 * 60_000).toISOString()
  const resolvedAt = spec.status === WORK_ORDER_STATUS.resolved || spec.status === WORK_ORDER_STATUS.closed
    ? dateOffset(Math.max(0, spec.createdDaysAgo - 1)) : undefined
  const closedAt = spec.status === WORK_ORDER_STATUS.closed ? dateOffset(Math.max(0, spec.createdDaysAgo - 2)) : undefined
  return {
    cr590_workordername: `${MARKER} ${spec.title}`,
    cr590_issuedescription: spec.description,
    cr590_priority: spec.priority,
    cr590_status: spec.status,
    'cr590_Department@odata.bind': `/${ENTITY_SETS.departments}(${departmentId})`,
    'cr590_ServiceCategory@odata.bind': `/${ENTITY_SETS.serviceCategories}(${categoryId})`,
    ...(employeeId ? { 'cr590_AssignedTo@odata.bind': `/${ENTITY_SETS.employees}(${employeeId})` } : {}),
    cr590_createtime: createdAt,
    cr590_expectedcompletiontime: expectedCompletionTime,
    cr590_resolution: spec.resolution,
    cr590_resolvedat: resolvedAt,
    cr590_closedat: closedAt,
    statecode: 0,
  }
}

function toWorkOrder(record: {
  id: string
  number: string
  spec: WorkOrderSeed
  department: DepartmentOption
  category: ServiceCategoryOption
  employee: EmployeeOption | null
}): WorkOrder {
  const resolved = record.spec.status === WORK_ORDER_STATUS.resolved || record.spec.status === WORK_ORDER_STATUS.closed
  return {
    id: record.id,
    workOrderNumber: record.number,
    workOrderName: `${MARKER} ${record.spec.title}`,
    issueDescription: record.spec.description,
    priority: record.spec.priority,
    status: record.spec.status,
    assignedToId: record.employee?.id ?? null,
    assignedToName: record.employee?.employeeName ?? null,
    departmentId: record.department.id,
    department: record.department.departmentName,
    serviceCategoryId: record.category.id,
    serviceCategoryLabel: record.category.serviceCategoryName,
    createTime: dateOffset(record.spec.createdDaysAgo),
    expectedCompletionTime: record.spec.dueInHours === null ? null : new Date(Date.now() + record.spec.dueInHours * 60 * 60_000).toISOString(),
    resolution: record.spec.resolution ?? null,
    resolvedAt: resolved ? dateOffset(Math.max(0, record.spec.createdDaysAgo - 1)) : null,
    closedAt: record.spec.status === WORK_ORDER_STATUS.closed ? dateOffset(Math.max(0, record.spec.createdDaysAgo - 2)) : null,
  }
}

async function createHistory(
  workOrder: WorkOrder,
  type: number,
  description: string,
  previousStatus: WorkOrderStatus | null,
  newStatus: WorkOrderStatus,
  occurredAt = workOrder.createTime,
) {
  const historyState = historyStatus(newStatus)
  const payload = {
    'cr590_WorkOrder@odata.bind': `/${ENTITY_SETS.workOrders}(${workOrder.id})`,
    cr590_historytype: type,
    cr590_changedat: occurredAt,
    cr590_changedescription: description.slice(0, 100),
    cr590_previousstatus: previousStatus === null ? undefined : historyStatus(previousStatus),
    cr590_newstatus: historyState,
    cr590_status: historyState,
    cr590_workordernumber: workOrder.workOrderNumber,
    statecode: 0,
  } as Omit<Cr590_tablesBase, 'cr590_tableid'>
  unwrap(await Cr590_tablesService.create(payload), 'WorkOrderHistory')
}

async function createAssignment(workOrder: WorkOrder, assignedFromId: string | null, employee: EmployeeOption) {
  const payload = {
    'cr590_WorkOrder@odata.bind': `/${ENTITY_SETS.workOrders}(${workOrder.id})`,
    ...(assignedFromId ? { 'cr590_AssignedFrom@odata.bind': `/${ENTITY_SETS.employees}(${assignedFromId})` } : {}),
    'cr590_AssignedTo@odata.bind': `/${ENTITY_SETS.employees}(${employee.id})`,
    cr590_assignmentname: `${MARKER} 初始派发 ${workOrder.workOrderNumber}`,
    cr590_assignedat: eventTime(workOrder, 0.5),
    cr590_assignmenttype: 326990000,
    cr590_assignmentnote: ASSIGNMENT_NOTE,
    cr590_assignmentsource: 326990000,
    statecode: 0,
  } as Omit<Cr590_assignmentsBase, 'cr590_assignmentid'>
  unwrap(await Cr590_assignmentsService.create(payload), 'Assignment')
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '未知错误'
}

function formatCounts(counts: TestDataSeedCounts): string {
  return `部门 ${counts.departments}、员工 ${counts.employees}、服务类别 ${counts.serviceCategories}、工单 ${counts.workOrders}、派发记录 ${counts.assignments}、历史记录 ${counts.histories}`
}

/** Adds uniquely marked IT support scenarios to the connected Dataverse tables; existing marked records are preserved. */
export async function seedDataverseITTestData(onProgress?: (phase: TestDataSeedPhase) => void): Promise<TestDataSeedCounts> {
  onProgress?.('checking')
  const state = await loadWorkOrderStateFromDataverse()
  if (state.readWarnings?.length) {
    throw new Error(`写入已取消：为避免重复或断开的 Lookup，需要先能完整读取六张表。${state.readWarnings.join(' ')}`)
  }

  const counts = zeroCounts()
  try {
    onProgress?.('resources')
    const departments = new Map<string, DepartmentOption>()
    for (const seed of departmentsSeed) {
      const existing = (state.departments ?? []).find((item) => item.departmentCode === seed.code)
      if (existing) departments.set(seed.code, existing)
      else {
        const created = unwrap(await Cr590_table1sService.create({
          cr590_deparmentcode: seed.code,
          cr590_departmentname: seed.name,
          cr590_description: seed.description,
          cr590_establisheddate: dateOnlyOffset(seed.establishedYearsAgo),
          cr590_isactive: true,
          statecode: 0,
        } as Omit<Cr590_table1sBase, 'cr590_table1id'>), 'Department')
        if (!created.cr590_table1id) throw new Error(`部门 ${seed.name} 已提交，但 Dataverse 未返回记录 ID。`)
        departments.set(seed.code, {
          id: created.cr590_table1id, departmentCode: seed.code, departmentName: seed.name,
          description: seed.description, establishedDate: dateOnlyOffset(seed.establishedYearsAgo),
          managerId: null, managerName: null, isActive: true,
        })
        counts.departments += 1
      }
    }

    const employees = new Map<string, EmployeeOption>()
    for (const seed of employeesSeed) {
      const existing = (state.employees ?? []).find((item) => item.email?.toLowerCase() === seed.email)
      if (existing) employees.set(seed.email, existing)
      else {
        const department = departments.get(seed.departmentCode)
        if (!department) throw new Error(`找不到员工 ${seed.name} 的部门 Lookup。`)
        const gender: Cr590_table2scr590_gender = 326990002
        const created = unwrap(await Cr590_table2sService.create({
          cr590_employeename: seed.name,
          cr590_email: seed.email,
          'cr590_Department@odata.bind': `/${ENTITY_SETS.departments}(${department.id})`,
          cr590_gender: gender,
          cr590_age: 28 + employeesSeed.indexOf(seed) % 9,
          cr590_hiredate: dateOnlyOffset(seed.hireYearsAgo),
          cr590_isactive: seed.active,
          cr590_isavailablefororder: seed.available,
          cr590_maxtaskload: seed.maxTaskLoad,
          cr590_skills: seed.skills,
          // Keep the Dataverse row active; the custom IsActive column represents the disabled test employee.
          statecode: 0,
        } as Omit<Cr590_table2sBase, 'cr590_table2id'>), 'Employee')
        if (!created.cr590_table2id) throw new Error(`员工 ${seed.name} 已提交，但 Dataverse 未返回记录 ID。`)
        employees.set(seed.email, {
          id: created.cr590_table2id, employeeName: seed.name, email: seed.email,
          departmentId: department.id, department: department.departmentName,
          gender: '其他', genderValue: gender, age: 28 + employeesSeed.indexOf(seed) % 9,
          hireDate: dateOnlyOffset(seed.hireYearsAgo), isActive: seed.active,
          isAvailableForOrder: seed.available, maxTaskLoad: seed.maxTaskLoad, skills: seed.skills,
        })
        counts.employees += 1
      }
    }

    for (const seed of departmentsSeed) {
      const department = departments.get(seed.code)
      const manager = employees.get(seed.managerEmail)
      if (department && manager && !department.managerId) {
        unwrap(await Cr590_table1sService.update(department.id, {
          'cr590_Manager@odata.bind': `/${ENTITY_SETS.employees}(${manager.id})`,
        }), 'Department manager')
        department.managerId = manager.id
        department.managerName = manager.employeeName
      }
    }

    const categories = new Map<string, ServiceCategoryOption>()
    for (const seed of categoriesSeed) {
      const existing = (state.serviceCategories ?? []).find((item) => item.categoryCode === seed.code)
      if (existing) categories.set(seed.code, existing)
      else {
        const department = departments.get(seed.departmentCode)
        if (!department) throw new Error(`找不到服务类别 ${seed.name} 的默认部门 Lookup。`)
        const defaultPriority = seed.priority as unknown as Cr590_servicecategoriescr590_defaultpriority
        const created = unwrap(await Cr590_servicecategoriesService.create({
          cr590_categorycode: seed.code,
          cr590_servicecategoryname: seed.name,
          'cr590_DefaultDepartment@odata.bind': `/${ENTITY_SETS.departments}(${department.id})`,
          cr590_defaultpriority: defaultPriority,
          cr590_description: seed.description,
          cr590_isactive: true,
          statecode: 0,
        } as Omit<Cr590_servicecategoriesBase, 'cr590_servicecategoryid'>), 'ServiceCategory')
        if (!created.cr590_servicecategoryid) throw new Error(`服务类别 ${seed.name} 已提交，但 Dataverse 未返回记录 ID。`)
        categories.set(seed.code, {
          id: created.cr590_servicecategoryid, categoryCode: seed.code, serviceCategoryName: seed.name,
          description: seed.description, defaultPriority, defaultDepartmentId: department.id,
          defaultDepartmentName: department.departmentName, isActive: true,
        })
        counts.serviceCategories += 1
      }
    }

    onProgress?.('work-orders')
    const orderMap = new Map((state.workOrders ?? []).filter((item) => item.workOrderName.startsWith(MARKER)).map((item) => [item.workOrderName, item]))
    for (const seed of workOrdersSeed) {
      const title = `${MARKER} ${seed.title}`
      if (orderMap.has(title)) continue
      const department = departments.get(seed.departmentCode)
      const category = categories.get(seed.categoryCode)
      const employee = seed.assignedEmail ? employees.get(seed.assignedEmail) ?? null : null
      if (!department || !category || (seed.assignedEmail && !employee)) throw new Error(`缺少工单 ${title} 所需的部门、类别或员工 Lookup。`)
      const created = unwrap(await Cr590_workordersService.create(makeWorkOrderSeedRecord(seed, department.id, category.id, employee?.id ?? null)), 'WorkOrder')
      if (!created.cr590_workorderid) throw new Error(`工单 ${title} 已提交，但 Dataverse 未返回记录 ID。`)
      const workOrder = toWorkOrder({
        id: created.cr590_workorderid,
        number: created.cr590_workordernumber ?? '',
        spec: seed,
        department,
        category,
        employee,
      })
      orderMap.set(title, workOrder)
      counts.workOrders += 1
    }

    onProgress?.('history')
    const events = state.events ?? []
    const assignments = state.assignments ?? []
    for (const seed of workOrdersSeed) {
      const title = `${MARKER} ${seed.title}`
      const workOrder = orderMap.get(title)
      if (!workOrder) continue
      const createdEventExists = events.some((item: WorkOrderEvent) => item.workOrderId === workOrder.id && item.kind === 'created' && item.description.includes(MARKER))
      if (!createdEventExists) {
        await createHistory(workOrder, 326990006, `${MARKER} 测试工单已创建`, null, WORK_ORDER_STATUS.new)
        counts.histories += 1
      }

      const employee = seed.assignedEmail ? employees.get(seed.assignedEmail) ?? null : null
      if (employee && !assignments.some((item) => item.workOrderId === workOrder.id)) {
        await createAssignment(workOrder, null, employee)
        counts.assignments += 1
      }

      if (seed.status !== WORK_ORDER_STATUS.new) {
        const statusEventExists = events.some((item: WorkOrderEvent) => item.workOrderId === workOrder.id && item.kind === 'status-change' && item.description.includes(MARKER))
        if (!statusEventExists) {
        await createHistory(workOrder, 326990000, `${MARKER} 示例状态：${STATUS_LABELS[seed.status]}`, WORK_ORDER_STATUS.new, seed.status, eventTime(workOrder, 2))
          counts.histories += 1
        }
      }
    }
  } catch (error) {
    throw new Error(`写入中断。本次已新增：${formatCounts(counts)}。已成功写入的记录会保留；修复后再次执行会跳过已存在的演练记录。原因：${errorText(error)}`)
  }

  return counts
}
