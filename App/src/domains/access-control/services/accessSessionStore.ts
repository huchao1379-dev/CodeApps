import {
  APP_ROLE_CATALOG,
  getDefaultAdminRoleId,
  getRoleCatalog,
  type AccessDomain,
  type AppRoleId,
  type DomainAccessSession,
} from '../types/access.types'

const STORAGE_KEY = 'codeapps.access.session.v2'

export interface AccessSessionSnapshot {
  inventory: DomainAccessSession
  itService: DomainAccessSession
}

const KNOWN_ROLE_IDS = new Set(APP_ROLE_CATALOG.map((role) => role.id))

function defaultDomainSession(domain: AccessDomain): DomainAccessSession {
  const adminId = getDefaultAdminRoleId(domain)
  return { activeRoleId: adminId, assignedRoleIds: [adminId] }
}

const DEFAULT_SNAPSHOT: AccessSessionSnapshot = {
  inventory: defaultDomainSession('inventory'),
  itService: defaultDomainSession('it-service'),
}

function isAppRoleId(value: unknown): value is AppRoleId {
  return typeof value === 'string' && KNOWN_ROLE_IDS.has(value as AppRoleId)
}

function sanitizeDomainSession(
  domain: AccessDomain,
  raw: Partial<DomainAccessSession> | undefined,
): DomainAccessSession {
  const catalogIds = new Set(getRoleCatalog(domain).map((role) => role.id))
  const assignedRoleIds = Array.isArray(raw?.assignedRoleIds)
    ? raw.assignedRoleIds.filter((id): id is AppRoleId => isAppRoleId(id) && catalogIds.has(id))
    : []
  const safeAssigned = assignedRoleIds.length > 0
    ? assignedRoleIds
    : [...defaultDomainSession(domain).assignedRoleIds]
  const activeRoleId = isAppRoleId(raw?.activeRoleId) && safeAssigned.includes(raw.activeRoleId)
    ? raw.activeRoleId
    : safeAssigned[0]
  return { activeRoleId, assignedRoleIds: safeAssigned }
}

function migrateLegacySnapshot(parsed: Record<string, unknown>): AccessSessionSnapshot | null {
  if (!('activeRoleId' in parsed) && !('assignedRoleIds' in parsed)) return null
  const inventory = sanitizeDomainSession('inventory', {
    activeRoleId: parsed.activeRoleId as AppRoleId | undefined,
    assignedRoleIds: parsed.assignedRoleIds as AppRoleId[] | undefined,
  })
  return {
    inventory,
    itService: defaultDomainSession('it-service'),
  }
}

export function loadAccessSession(): AccessSessionSnapshot {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
      ?? window.sessionStorage.getItem('codeapps.access.session.v1')
    if (!raw) {
      return {
        inventory: { ...DEFAULT_SNAPSHOT.inventory, assignedRoleIds: [...DEFAULT_SNAPSHOT.inventory.assignedRoleIds] },
        itService: { ...DEFAULT_SNAPSHOT.itService, assignedRoleIds: [...DEFAULT_SNAPSHOT.itService.assignedRoleIds] },
      }
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.inventory || parsed.itService) {
      return {
        inventory: sanitizeDomainSession('inventory', parsed.inventory as Partial<DomainAccessSession> | undefined),
        itService: sanitizeDomainSession('it-service', parsed.itService as Partial<DomainAccessSession> | undefined),
      }
    }
    return migrateLegacySnapshot(parsed) ?? {
      inventory: { ...DEFAULT_SNAPSHOT.inventory, assignedRoleIds: [...DEFAULT_SNAPSHOT.inventory.assignedRoleIds] },
      itService: { ...DEFAULT_SNAPSHOT.itService, assignedRoleIds: [...DEFAULT_SNAPSHOT.itService.assignedRoleIds] },
    }
  } catch {
    return {
      inventory: { ...DEFAULT_SNAPSHOT.inventory, assignedRoleIds: [...DEFAULT_SNAPSHOT.inventory.assignedRoleIds] },
      itService: { ...DEFAULT_SNAPSHOT.itService, assignedRoleIds: [...DEFAULT_SNAPSHOT.itService.assignedRoleIds] },
    }
  }
}

export function saveAccessSession(snapshot: AccessSessionSnapshot) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

export function clearAccessSession() {
  window.sessionStorage.removeItem(STORAGE_KEY)
  window.sessionStorage.removeItem('codeapps.access.session.v1')
}
