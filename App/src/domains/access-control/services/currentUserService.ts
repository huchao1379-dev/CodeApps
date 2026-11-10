import { getContext } from '@microsoft/power-apps/app'
import type { EnvironmentUserInfo } from '../types/access.types'

function fallbackUser(error: string | null): EnvironmentUserInfo {
  return {
    id: 'local-dev-user',
    systemUserId: null,
    fullName: '本地开发用户',
    email: 'local.dev@example.com',
    source: 'local-fallback',
    loadedAt: new Date().toISOString(),
    error,
  }
}

/** Reads the signed-in Code Apps / Power Platform user when available. */
export async function loadEnvironmentUser(): Promise<EnvironmentUserInfo> {
  try {
    const context = await getContext()
    const user = context.user as {
      fullName?: string
      userPrincipalName?: string
      systemUserId?: string
      objectId?: string
      id?: string
    }
    const fullName = user.fullName?.trim() || null
    const email = user.userPrincipalName?.trim() || null
    const systemUserId = user.systemUserId?.trim() || null
    const id = systemUserId
      ?? user.objectId
      ?? user.id
      ?? email
      ?? fullName
      ?? null

    if (!fullName && !email) {
      return fallbackUser('Power Apps 上下文未返回用户姓名或邮箱。')
    }

    return {
      id,
      systemUserId,
      fullName,
      email,
      source: 'power-apps',
      loadedAt: new Date().toISOString(),
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取 Power Apps 用户上下文失败'
    return fallbackUser(`${message}（已回退本地模拟用户，便于开发预览）`)
  }
}
