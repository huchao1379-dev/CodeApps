import { getContext } from '@microsoft/power-apps/app'
import { RolesService } from '../../../generated/services/RolesService'
import { SystemuserrolescollectionService } from '../../../generated/services/SystemuserrolescollectionService'

/** Canonical Dataverse Security Role used to gate the IT workbench role page. */
export const ITOPS_ADMIN_ROLE_NAME = 'Itops Admin'

const ITOPS_ADMIN_ALIASES = [
  'itops admin',
  'itopsadmin',
  'i tops admin',
]

export interface DataverseSecurityRoleInfo {
  systemUserId: string | null
  roleIds: string[]
  roleNames: string[]
  hasItopsAdmin: boolean
  loadedAt: string
  source: 'dataverse' | 'local-fallback'
  error: string | null
}

function normalizeRoleName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '')
}

export function isItopsAdminRoleName(roleName: string | null | undefined) {
  if (!roleName) return false
  const normalized = normalizeRoleName(roleName)
  return ITOPS_ADMIN_ALIASES.some((alias) => normalizeRoleName(alias) === normalized)
    || normalized.includes('itopsadmin')
}

function fallbackRoles(error: string | null): DataverseSecurityRoleInfo {
  return {
    systemUserId: null,
    roleIds: [],
    roleNames: [],
    hasItopsAdmin: false,
    loadedAt: new Date().toISOString(),
    source: 'local-fallback',
    error,
  }
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

async function resolveSystemUserId(): Promise<{ systemUserId: string | null; error: string | null }> {
  try {
    const context = await getContext()
    const user = context.user as {
      systemUserId?: string
      id?: string
      objectId?: string
      userPrincipalName?: string
    }
    const systemUserId = user.systemUserId?.trim() || null
    if (systemUserId) return { systemUserId, error: null }
    return {
      systemUserId: null,
      error: 'Power Apps 上下文未返回 systemUserId，无法查询 Dataverse 安全角色。',
    }
  } catch (error) {
    return {
      systemUserId: null,
      error: error instanceof Error ? error.message : '读取 Power Apps 用户上下文失败',
    }
  }
}

/**
 * Loads the signed-in user's Dataverse Security Roles via systemuserroles + roles.
 * Used to verify real environment role assignment (e.g. Itops Admin).
 */
export async function loadDataverseSecurityRoles(): Promise<DataverseSecurityRoleInfo> {
  const resolved = await resolveSystemUserId()
  if (!resolved.systemUserId) {
    return fallbackRoles(
      `${resolved.error ?? '无法解析当前 Dataverse 用户'}（本地/预览环境会显示无 Itops Admin，便于验证拒绝路径）`,
    )
  }

  try {
    const assignmentResult = await SystemuserrolescollectionService.getAll({
      select: ['systemuserroleid', 'systemuserid', 'roleid'],
      filter: `systemuserid eq ${resolved.systemUserId}`,
      top: 200,
    })
    if (!assignmentResult.success) {
      const message = assignmentResult.error instanceof Error
        ? assignmentResult.error.message
        : '读取 systemuserroles 失败'
      return {
        ...fallbackRoles(message),
        systemUserId: resolved.systemUserId,
      }
    }

    const roleIds = Array.from(new Set(
      (assignmentResult.data ?? [])
        .map((row) => row.roleid)
        .filter((id): id is string => Boolean(id)),
    ))

    if (roleIds.length === 0) {
      return {
        systemUserId: resolved.systemUserId,
        roleIds: [],
        roleNames: [],
        hasItopsAdmin: false,
        loadedAt: new Date().toISOString(),
        source: 'dataverse',
        error: null,
      }
    }

    const roleNames: string[] = []
    for (const group of chunk(roleIds, 20)) {
      const filter = group.map((id) => `roleid eq ${id}`).join(' or ')
      const rolesResult = await RolesService.getAll({
        select: ['roleid', 'name'],
        filter,
        top: group.length,
      })
      if (!rolesResult.success) {
        const message = rolesResult.error instanceof Error
          ? rolesResult.error.message
          : '读取 roles 失败。请确认应用已添加 role 数据源并有读取权限。'
        return {
          systemUserId: resolved.systemUserId,
          roleIds,
          roleNames,
          hasItopsAdmin: false,
          loadedAt: new Date().toISOString(),
          source: 'dataverse',
          error: message,
        }
      }
      for (const role of rolesResult.data ?? []) {
        if (role.name) roleNames.push(role.name)
      }
    }

    return {
      systemUserId: resolved.systemUserId,
      roleIds,
      roleNames,
      hasItopsAdmin: roleNames.some((name) => isItopsAdminRoleName(name)),
      loadedAt: new Date().toISOString(),
      source: 'dataverse',
      error: null,
    }
  } catch (error) {
    return {
      ...fallbackRoles(error instanceof Error ? error.message : '查询 Dataverse 安全角色失败'),
      systemUserId: resolved.systemUserId,
    }
  }
}
