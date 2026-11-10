/** Workspace domains that own independent test-role catalogs. */
export type AccessDomain = 'inventory' | 'it-service'

export type InventoryPermission =
  | 'inventory.view'
  | 'inventory.create'
  | 'inventory.edit'
  | 'inventory.receive'
  | 'inventory.issue'
  | 'inventory.transfer'
  | 'inventory.adjust'
  | 'inventory.reserve'
  | 'inventory.scan'
  | 'inventory.stocktake'
  | 'inventory.stocktake.post'
  | 'inventory.purchase.create'
  | 'inventory.purchase.receive'
  | 'inventory.purchase.cancel'
  | 'inventory.manageRoles'

export type ItServicePermission =
  | 'it.view'
  | 'it.create'
  | 'it.edit'
  | 'it.assign'
  | 'it.unassign'
  | 'it.status'
  | 'it.bulk'
  | 'it.approvals'
  | 'it.resources.view'
  | 'it.resources.edit'
  | 'it.seed'
  | 'it.manageRoles'

export type AppPermission = InventoryPermission | ItServicePermission

export type InventoryRoleId =
  | 'inventory-admin'
  | 'inventory-operator'
  | 'inventory-purchaser'
  | 'inventory-stocktake'
  | 'inventory-viewer'

export type ItServiceRoleId =
  | 'it-admin'
  | 'it-dispatcher'
  | 'it-agent'
  | 'it-resource-manager'
  | 'it-viewer'

export type AppRoleId = InventoryRoleId | ItServiceRoleId

export interface AppRoleDefinition {
  id: AppRoleId
  domain: AccessDomain
  name: string
  description: string
  permissions: AppPermission[]
}

export interface EnvironmentUserInfo {
  id: string | null
  /** Dataverse systemuser primary id when available from getContext(). */
  systemUserId: string | null
  fullName: string | null
  email: string | null
  source: 'power-apps' | 'local-fallback'
  loadedAt: string
  error: string | null
}

export interface DataverseSecurityRoleSnapshot {
  systemUserId: string | null
  roleIds: string[]
  roleNames: string[]
  hasItopsAdmin: boolean
  loadedAt: string
  source: 'dataverse' | 'local-fallback'
  error: string | null
}

export interface DomainAccessSession {
  activeRoleId: AppRoleId
  assignedRoleIds: AppRoleId[]
}

export interface AccessControlState {
  environmentUser: EnvironmentUserInfo
  inventory: DomainAccessSession
  itService: DomainAccessSession
  loadingUser: boolean
}

export const ACCESS_DOMAIN_LABELS: Record<AccessDomain, string> = {
  inventory: '库存管理工作台',
  'it-service': 'IT 服务运营',
}

export const APP_PERMISSION_LABELS: Record<AppPermission, string> = {
  'inventory.view': '查看库存',
  'inventory.create': '新建物资',
  'inventory.edit': '编辑物资',
  'inventory.receive': '入库',
  'inventory.issue': '领用出库',
  'inventory.transfer': '调拨',
  'inventory.adjust': '库存调整',
  'inventory.reserve': '预留/释放',
  'inventory.scan': 'SKU 扫码',
  'inventory.stocktake': '库位盘点录入',
  'inventory.stocktake.post': '盘点过账',
  'inventory.purchase.create': '生成采购单',
  'inventory.purchase.receive': '采购收货',
  'inventory.purchase.cancel': '取消采购单',
  'inventory.manageRoles': '管理库存测试角色',
  'it.view': '查看工单',
  'it.create': '新建工单',
  'it.edit': '编辑工单',
  'it.assign': '派发 / 调整负责人',
  'it.unassign': '撤销派发',
  'it.status': '变更工单状态',
  'it.bulk': '批量操作工单',
  'it.approvals': '查看负责人申请',
  'it.resources.view': '查看资源目录',
  'it.resources.edit': '编辑资源目录',
  'it.seed': '写入 IT 演练数据',
  'it.manageRoles': '管理 IT 测试角色',
}

export const INVENTORY_ROLE_CATALOG: AppRoleDefinition[] = [
  {
    id: 'inventory-admin',
    domain: 'inventory',
    name: '库存管理员',
    description: '全部库存权限，可切换测试角色（对应 Dataverse 库管类角色）。',
    permissions: [
      'inventory.view',
      'inventory.create',
      'inventory.edit',
      'inventory.receive',
      'inventory.issue',
      'inventory.transfer',
      'inventory.adjust',
      'inventory.reserve',
      'inventory.scan',
      'inventory.stocktake',
      'inventory.stocktake.post',
      'inventory.purchase.create',
      'inventory.purchase.receive',
      'inventory.purchase.cancel',
      'inventory.manageRoles',
    ],
  },
  {
    id: 'inventory-operator',
    domain: 'inventory',
    name: '库存作业员',
    description: '日常出入库、调拨、扫码；不可过账盘点、不可取消采购单。',
    permissions: [
      'inventory.view',
      'inventory.create',
      'inventory.edit',
      'inventory.receive',
      'inventory.issue',
      'inventory.transfer',
      'inventory.adjust',
      'inventory.reserve',
      'inventory.scan',
      'inventory.stocktake',
    ],
  },
  {
    id: 'inventory-purchaser',
    domain: 'inventory',
    name: '采购员',
    description: '查看库存、补货建议、生成/收货采购单。',
    permissions: [
      'inventory.view',
      'inventory.receive',
      'inventory.purchase.create',
      'inventory.purchase.receive',
      'inventory.purchase.cancel',
    ],
  },
  {
    id: 'inventory-stocktake',
    domain: 'inventory',
    name: '盘点员',
    description: '查看库存并执行盘点录入与过账。',
    permissions: [
      'inventory.view',
      'inventory.stocktake',
      'inventory.stocktake.post',
      'inventory.adjust',
    ],
  },
  {
    id: 'inventory-viewer',
    domain: 'inventory',
    name: '只读查看员',
    description: '仅可查看库存数据，不可执行写操作。',
    permissions: ['inventory.view'],
  },
]

export const IT_SERVICE_ROLE_CATALOG: AppRoleDefinition[] = [
  {
    id: 'it-admin',
    domain: 'it-service',
    name: 'IT 服务管理员',
    description: '工单、派发、审批、资源与演练数据全权限，可管理测试角色。',
    permissions: [
      'it.view',
      'it.create',
      'it.edit',
      'it.assign',
      'it.unassign',
      'it.status',
      'it.bulk',
      'it.approvals',
      'it.resources.view',
      'it.resources.edit',
      'it.seed',
      'it.manageRoles',
    ],
  },
  {
    id: 'it-dispatcher',
    domain: 'it-service',
    name: '派发调度员',
    description: '查看工单、派发/撤派、批量调整负责人与审批申请；不可改资源目录。',
    permissions: [
      'it.view',
      'it.assign',
      'it.unassign',
      'it.bulk',
      'it.approvals',
      'it.resources.view',
    ],
  },
  {
    id: 'it-agent',
    domain: 'it-service',
    name: '一线工程师',
    description: '查看与编辑工单、变更状态；不可派发、批量与改资源。',
    permissions: [
      'it.view',
      'it.edit',
      'it.status',
      'it.resources.view',
    ],
  },
  {
    id: 'it-resource-manager',
    domain: 'it-service',
    name: '资源管理员',
    description: '维护员工、部门、服务类别；可查看工单但不可派发写操作。',
    permissions: [
      'it.view',
      'it.resources.view',
      'it.resources.edit',
    ],
  },
  {
    id: 'it-viewer',
    domain: 'it-service',
    name: 'IT 只读查看员',
    description: '仅可查看工单、审批与资源，不可任何写操作。',
    permissions: [
      'it.view',
      'it.approvals',
      'it.resources.view',
    ],
  },
]

/** @deprecated Prefer domain catalogs; kept as union for broad lookups. */
export const APP_ROLE_CATALOG: AppRoleDefinition[] = [
  ...INVENTORY_ROLE_CATALOG,
  ...IT_SERVICE_ROLE_CATALOG,
]

export function getRoleCatalog(domain: AccessDomain): AppRoleDefinition[] {
  return domain === 'inventory' ? INVENTORY_ROLE_CATALOG : IT_SERVICE_ROLE_CATALOG
}

export function getDomainPermissions(domain: AccessDomain): AppPermission[] {
  return getRoleCatalog(domain)
    .flatMap((role) => role.permissions)
    .filter((permission, index, list) => list.indexOf(permission) === index)
}

export function getManagePermission(domain: AccessDomain): AppPermission {
  return domain === 'inventory' ? 'inventory.manageRoles' : 'it.manageRoles'
}

export function getDefaultAdminRoleId(domain: AccessDomain): AppRoleId {
  return domain === 'inventory' ? 'inventory-admin' : 'it-admin'
}

export function getDefaultViewerRoleId(domain: AccessDomain): AppRoleId {
  return domain === 'inventory' ? 'inventory-viewer' : 'it-viewer'
}

export function getPermissionDomain(permission: AppPermission): AccessDomain {
  return permission.startsWith('it.') ? 'it-service' : 'inventory'
}

export function getRoleDefinition(roleId: AppRoleId) {
  return APP_ROLE_CATALOG.find((role) => role.id === roleId) ?? INVENTORY_ROLE_CATALOG[0]
}

export function collectPermissions(roleIds: AppRoleId[]): Set<AppPermission> {
  const permissions = new Set<AppPermission>()
  roleIds.forEach((roleId) => {
    getRoleDefinition(roleId).permissions.forEach((permission) => permissions.add(permission))
  })
  return permissions
}
