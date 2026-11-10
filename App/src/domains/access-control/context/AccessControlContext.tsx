import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { loadAccessSession, saveAccessSession } from '../services/accessSessionStore'
import { loadEnvironmentUser } from '../services/currentUserService'
import {
  ITOPS_ADMIN_ROLE_NAME,
  loadDataverseSecurityRoles,
} from '../services/dataverseSecurityRoleService'
import {
  APP_ROLE_CATALOG,
  collectPermissions,
  getDefaultAdminRoleId,
  getDefaultViewerRoleId,
  getPermissionDomain,
  getRoleCatalog,
  getRoleDefinition,
  type AccessDomain,
  type AppPermission,
  type AppRoleId,
  type DataverseSecurityRoleSnapshot,
  type DomainAccessSession,
  type EnvironmentUserInfo,
} from '../types/access.types'

interface AccessControlContextValue {
  environmentUser: EnvironmentUserInfo
  loadingUser: boolean
  dataverseRoles: DataverseSecurityRoleSnapshot
  loadingDataverseRoles: boolean
  inventory: DomainAccessSession
  itService: DomainAccessSession
  /** Combined effective permissions from both domain active roles. */
  permissions: Set<AppPermission>
  getDomainSession: (domain: AccessDomain) => DomainAccessSession
  getDomainPermissions: (domain: AccessDomain) => Set<AppPermission>
  refreshEnvironmentUser: () => Promise<void>
  refreshDataverseRoles: () => Promise<void>
  setActiveRole: (domain: AccessDomain, roleId: AppRoleId) => void
  setAssignedRoles: (domain: AccessDomain, roleIds: AppRoleId[]) => void
  resetToAdminSession: (domain: AccessDomain) => void
  can: (permission: AppPermission) => boolean
  canAny: (...permissions: AppPermission[]) => boolean
  canAll: (...permissions: AppPermission[]) => boolean
  /** True when Dataverse Security Role "Itops Admin" is assigned to the signed-in user. */
  hasItopsAdmin: boolean
}

const AccessControlContext = createContext<AccessControlContextValue | null>(null)

function domainKey(domain: AccessDomain): 'inventory' | 'itService' {
  return domain === 'inventory' ? 'inventory' : 'itService'
}

const EMPTY_DATAVERSE_ROLES: DataverseSecurityRoleSnapshot = {
  systemUserId: null,
  roleIds: [],
  roleNames: [],
  hasItopsAdmin: false,
  loadedAt: new Date(0).toISOString(),
  source: 'local-fallback',
  error: null,
}

export function AccessControlProvider({ children }: { children: ReactNode }) {
  const initial = loadAccessSession()
  const [environmentUser, setEnvironmentUser] = useState<EnvironmentUserInfo>({
    id: null,
    systemUserId: null,
    fullName: null,
    email: null,
    source: 'local-fallback',
    loadedAt: new Date().toISOString(),
    error: null,
  })
  const [loadingUser, setLoadingUser] = useState(true)
  const [dataverseRoles, setDataverseRoles] = useState<DataverseSecurityRoleSnapshot>(EMPTY_DATAVERSE_ROLES)
  const [loadingDataverseRoles, setLoadingDataverseRoles] = useState(true)
  const [inventory, setInventory] = useState<DomainAccessSession>(initial.inventory)
  const [itService, setItService] = useState<DomainAccessSession>(initial.itService)

  const refreshDataverseRoles = useCallback(async () => {
    setLoadingDataverseRoles(true)
    const roles = await loadDataverseSecurityRoles()
    setDataverseRoles(roles)
    setLoadingDataverseRoles(false)
  }, [])

  const refreshEnvironmentUser = useCallback(async () => {
    setLoadingUser(true)
    const user = await loadEnvironmentUser()
    setEnvironmentUser(user)
    setLoadingUser(false)
    await refreshDataverseRoles()
  }, [refreshDataverseRoles])

  useEffect(() => {
    void refreshEnvironmentUser()
  }, [refreshEnvironmentUser])

  useEffect(() => {
    saveAccessSession({ inventory, itService })
  }, [inventory, itService])

  const inventoryPermissions = useMemo(
    () => collectPermissions([inventory.activeRoleId]),
    [inventory.activeRoleId],
  )
  const itServicePermissions = useMemo(
    () => collectPermissions([itService.activeRoleId]),
    [itService.activeRoleId],
  )
  const permissions = useMemo(() => {
    const merged = new Set<AppPermission>()
    inventoryPermissions.forEach((permission) => merged.add(permission))
    itServicePermissions.forEach((permission) => merged.add(permission))
    return merged
  }, [inventoryPermissions, itServicePermissions])

  const updateDomain = useCallback((domain: AccessDomain, updater: (current: DomainAccessSession) => DomainAccessSession) => {
    if (domain === 'inventory') setInventory(updater)
    else setItService(updater)
  }, [])

  const setActiveRole = useCallback((domain: AccessDomain, roleId: AppRoleId) => {
    const role = getRoleDefinition(roleId)
    if (role.domain !== domain) return
    updateDomain(domain, (current) => ({
      activeRoleId: roleId,
      assignedRoleIds: current.assignedRoleIds.includes(roleId)
        ? current.assignedRoleIds
        : [...current.assignedRoleIds, roleId],
    }))
  }, [updateDomain])

  const setAssignedRoles = useCallback((domain: AccessDomain, roleIds: AppRoleId[]) => {
    const catalogIds = new Set(getRoleCatalog(domain).map((role) => role.id))
    const filtered = roleIds.filter((roleId) => catalogIds.has(roleId))
    const next = filtered.length > 0 ? filtered : [getDefaultViewerRoleId(domain)]
    updateDomain(domain, (current) => ({
      assignedRoleIds: next,
      activeRoleId: next.includes(current.activeRoleId) ? current.activeRoleId : next[0],
    }))
  }, [updateDomain])

  const resetToAdminSession = useCallback((domain: AccessDomain) => {
    const adminId = getDefaultAdminRoleId(domain)
    updateDomain(domain, () => ({ activeRoleId: adminId, assignedRoleIds: [adminId] }))
  }, [updateDomain])

  const getDomainSession = useCallback((domain: AccessDomain) => (
    domain === 'inventory' ? inventory : itService
  ), [inventory, itService])

  const getDomainPermissions = useCallback((domain: AccessDomain) => (
    domain === 'inventory' ? inventoryPermissions : itServicePermissions
  ), [inventoryPermissions, itServicePermissions])

  const can = useCallback((permission: AppPermission) => {
    const domain = getPermissionDomain(permission)
    return domain === 'inventory'
      ? inventoryPermissions.has(permission)
      : itServicePermissions.has(permission)
  }, [inventoryPermissions, itServicePermissions])

  const value = useMemo<AccessControlContextValue>(() => ({
    environmentUser,
    loadingUser,
    dataverseRoles,
    loadingDataverseRoles,
    inventory,
    itService,
    permissions,
    getDomainSession,
    getDomainPermissions,
    refreshEnvironmentUser,
    refreshDataverseRoles,
    setActiveRole,
    setAssignedRoles,
    resetToAdminSession,
    can,
    canAny: (...required) => required.some((permission) => can(permission)),
    canAll: (...required) => required.every((permission) => can(permission)),
    hasItopsAdmin: dataverseRoles.hasItopsAdmin,
  }), [
    environmentUser,
    loadingUser,
    dataverseRoles,
    loadingDataverseRoles,
    inventory,
    itService,
    permissions,
    getDomainSession,
    getDomainPermissions,
    refreshEnvironmentUser,
    refreshDataverseRoles,
    setActiveRole,
    setAssignedRoles,
    resetToAdminSession,
    can,
  ])

  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>
}

export function useAccessControl() {
  const value = useContext(AccessControlContext)
  if (!value) throw new Error('useAccessControl must be used within AccessControlProvider')
  return value
}

export function useOptionalAccessControl() {
  return useContext(AccessControlContext)
}

export { APP_ROLE_CATALOG, getRoleDefinition, domainKey, ITOPS_ADMIN_ROLE_NAME }
