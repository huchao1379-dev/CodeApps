import { useMemo, useState } from 'react'
import { StatusBadge, Toast } from '../../../shared/components'
import {
  ACCESS_DOMAIN_LABELS,
  APP_PERMISSION_LABELS,
  getDomainPermissions,
  getManagePermission,
  getRoleCatalog,
  getRoleDefinition,
  type AccessDomain,
  type AppPermission,
  type AppRoleId,
} from '../types/access.types'
import { useAccessControl } from '../context/AccessControlContext'
import { ITOPS_ADMIN_ROLE_NAME } from '../services/dataverseSecurityRoleService'
import './RolePermissionPage.css'

type InventoryVerifyView = 'ledger' | 'replenish' | 'stocktake' | 'batches' | 'alerts'
type ItVerifyView = '工单管理' | '派发看板' | '负责人申请' | '资源目录'

const INVENTORY_VERIFY_SCENARIOS: Array<{
  id: string
  label: string
  description: string
  permission: AppPermission
  targetView: InventoryVerifyView
}> = [
  {
    id: 'create-item',
    label: '新建物资',
    description: '库存台账「新建物资」按钮',
    permission: 'inventory.create',
    targetView: 'ledger',
  },
  {
    id: 'purchase',
    label: '生成采购单',
    description: '补货计划勾选后生成采购单',
    permission: 'inventory.purchase.create',
    targetView: 'replenish',
  },
  {
    id: 'stocktake-post',
    label: '盘点过账',
    description: '库位盘点「过账调整」',
    permission: 'inventory.stocktake.post',
    targetView: 'stocktake',
  },
  {
    id: 'issue-batch',
    label: '临期领用',
    description: '批次效期「临期领用 / 隔离出库」',
    permission: 'inventory.issue',
    targetView: 'batches',
  },
  {
    id: 'alert-replenish',
    label: '预警补货',
    description: '预警中心「补货」动作',
    permission: 'inventory.receive',
    targetView: 'alerts',
  },
]

const IT_VERIFY_SCENARIOS: Array<{
  id: string
  label: string
  description: string
  permission: AppPermission
  targetView: ItVerifyView
}> = [
  {
    id: 'create-work-order',
    label: '新建工单',
    description: '工单管理页头「新建工单」',
    permission: 'it.create',
    targetView: '工单管理',
  },
  {
    id: 'assign',
    label: '派发负责人',
    description: '派发看板拖拽 / 工单「派发」',
    permission: 'it.assign',
    targetView: '派发看板',
  },
  {
    id: 'status',
    label: '变更状态',
    description: '工单详情「变更状态」',
    permission: 'it.status',
    targetView: '工单管理',
  },
  {
    id: 'bulk',
    label: '批量操作',
    description: '工单列表批量调整负责人/状态',
    permission: 'it.bulk',
    targetView: '工单管理',
  },
  {
    id: 'resources',
    label: '编辑资源',
    description: '资源目录编辑员工/部门/类别',
    permission: 'it.resources.edit',
    targetView: '资源目录',
  },
]

export interface RolePermissionPageProps {
  domain: AccessDomain
  onNavigateInventory?: (view: InventoryVerifyView) => void
  onNavigateItService?: (view: ItVerifyView) => void
}

export function RolePermissionPage({
  domain,
  onNavigateInventory,
  onNavigateItService,
}: RolePermissionPageProps) {
  const {
    environmentUser,
    loadingUser,
    dataverseRoles,
    loadingDataverseRoles,
    hasItopsAdmin,
    getDomainSession,
    getDomainPermissions: getActiveDomainPermissions,
    refreshEnvironmentUser,
    refreshDataverseRoles,
    setActiveRole,
    setAssignedRoles,
    resetToAdminSession,
    can,
  } = useAccessControl()
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [probeResult, setProbeResult] = useState<{ permission: AppPermission; allowed: boolean } | null>(null)

  const session = getDomainSession(domain)
  const permissions = getActiveDomainPermissions(domain)
  const roleCatalog = getRoleCatalog(domain)
  const permissionOrder = useMemo(() => getDomainPermissions(domain), [domain])
  const managePermission = getManagePermission(domain)
  const activeRole = getRoleDefinition(session.activeRoleId)
  const canManage = can(managePermission)
  const domainLabel = ACCESS_DOMAIN_LABELS[domain]
  const verifyScenarios = domain === 'inventory' ? INVENTORY_VERIFY_SCENARIOS : IT_VERIFY_SCENARIOS
  const requiresItopsAdmin = domain === 'it-service'
  const checkingItopsAdmin = requiresItopsAdmin && (loadingUser || loadingDataverseRoles)

  const matrix = useMemo(() => (
    roleCatalog.map((role) => ({
      role,
      granted: new Set(role.permissions),
    }))
  ), [roleCatalog])

  const toggleAssigned = (roleId: AppRoleId) => {
    if (!canManage) {
      setNotice({
        kind: 'error',
        message: `当前生效角色无「${APP_PERMISSION_LABELS[managePermission]}」权限。请先「重置为管理员」或切回管理员角色。`,
      })
      return
    }
    if (session.assignedRoleIds.includes(roleId)) {
      if (session.assignedRoleIds.length === 1) {
        setNotice({ kind: 'info', message: '至少保留一个已分配角色。' })
        return
      }
      setAssignedRoles(domain, session.assignedRoleIds.filter((id) => id !== roleId))
      setNotice({ kind: 'success', message: `已移除角色：${getRoleDefinition(roleId).name}` })
      return
    }
    setAssignedRoles(domain, [...session.assignedRoleIds, roleId])
    setNotice({ kind: 'success', message: `已分配角色：${getRoleDefinition(roleId).name}` })
  }

  const activateRole = (roleId: AppRoleId) => {
    if (!session.assignedRoleIds.includes(roleId)) {
      if (!canManage) {
        setNotice({ kind: 'error', message: '该角色未分配。请用管理员先完成分配，或点击「重置为管理员」。' })
        return
      }
      setAssignedRoles(domain, [...session.assignedRoleIds, roleId])
    }
    setActiveRole(domain, roleId)
    setProbeResult(null)
    setNotice({
      kind: 'success',
      message: `已切换「${domainLabel}」生效角色为「${getRoleDefinition(roleId).name}」。可在下方试探或跳转页面验证。`,
    })
  }

  const probePermission = (permission: AppPermission) => {
    const allowed = can(permission)
    setProbeResult({ permission, allowed })
    setNotice({
      kind: allowed ? 'success' : 'error',
      message: allowed
        ? `试探通过：当前角色拥有「${APP_PERMISSION_LABELS[permission]}」。`
        : `试探拒绝：当前角色无「${APP_PERMISSION_LABELS[permission]}」。`,
    })
  }

  const refreshIdentity = () => {
    void refreshEnvironmentUser()
  }

  if (checkingItopsAdmin) {
    return <section className="access-panel" aria-label={`${domainLabel}角色权限管理`}>
      <section className="access-card access-gate-card">
        <header className="access-card-header">
          <div>
            <h2>正在校验 Dataverse 安全角色</h2>
            <p>读取当前登录用户是否具备「{ITOPS_ADMIN_ROLE_NAME}」…</p>
          </div>
        </header>
        <p className="access-gate-loading" role="status">校验中…</p>
      </section>
    </section>
  }

  if (requiresItopsAdmin && !hasItopsAdmin) {
    return <section className="access-panel" aria-label={`${domainLabel}角色权限管理`}>
      <section className="access-card access-gate-card access-gate-denied">
        <header className="access-card-header">
          <div>
            <h2>Dataverse 身份校验</h2>
            <p>
              IT 工作台角色权限页要求真实 Security Role「{ITOPS_ADMIN_ROLE_NAME}」。
              请在 Power Platform 管理中心为当前用户分配该角色后刷新。
            </p>
          </div>
          <div className="access-header-actions">
            <button className="button button-quiet" type="button" disabled={loadingDataverseRoles} onClick={refreshIdentity}>
              {loadingDataverseRoles ? '重新校验中…' : '重新校验'}
            </button>
          </div>
        </header>
        <p className="access-gate-message" role="alert">当前用户没有itopsadmin身份</p>
        <dl className="access-user-grid">
          <div><dt>显示名</dt><dd>{environmentUser.fullName ?? '—'}</dd></div>
          <div><dt>邮箱 / UPN</dt><dd>{environmentUser.email ?? '—'}</dd></div>
          <div><dt>Dataverse 用户 Id</dt><dd className="access-mono">{dataverseRoles.systemUserId ?? environmentUser.systemUserId ?? '—'}</dd></div>
          <div>
            <dt>角色来源</dt>
            <dd>
              <StatusBadge
                status={dataverseRoles.source}
                label={dataverseRoles.source === 'dataverse' ? 'Dataverse 查询' : '本地回退'}
                variant={dataverseRoles.source === 'dataverse' ? 'success' : 'warning'}
                size="small"
              />
            </dd>
          </div>
          <div><dt>已读取角色数</dt><dd>{dataverseRoles.roleNames.length}</dd></div>
          <div><dt>已读取角色</dt><dd>{dataverseRoles.roleNames.length > 0 ? dataverseRoles.roleNames.join('、') : '—'}</dd></div>
        </dl>
        {dataverseRoles.error && <p className="access-warning" role="status">{dataverseRoles.error}</p>}
      </section>
    </section>
  }

  return <section className="access-panel" aria-label={`${domainLabel}角色权限管理`}>
    {notice && <Toast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    {requiresItopsAdmin && <section className="access-card access-gate-card access-gate-allowed">
      <header className="access-card-header">
        <div>
          <h2>Dataverse 身份校验通过</h2>
          <p>当前用户已具备 Security Role「{ITOPS_ADMIN_ROLE_NAME}」，可管理 IT 工作台测试角色。</p>
        </div>
        <div className="access-header-actions">
          <StatusBadge status="itops-admin" label={ITOPS_ADMIN_ROLE_NAME} variant="success" size="small" />
          <button className="button button-quiet" type="button" disabled={loadingDataverseRoles} onClick={() => void refreshDataverseRoles()}>
            {loadingDataverseRoles ? '刷新中…' : '刷新安全角色'}
          </button>
        </div>
      </header>
      <dl className="access-user-grid">
        <div><dt>Dataverse 用户 Id</dt><dd className="access-mono">{dataverseRoles.systemUserId ?? '—'}</dd></div>
        <div><dt>已读取角色</dt><dd>{dataverseRoles.roleNames.join('、') || '—'}</dd></div>
      </dl>
    </section>}

    <section className="access-card">
      <header className="access-card-header">
        <div>
          <h2>当前环境用户 · {domainLabel}</h2>
          <p>
            通过 Code Apps <code>getContext()</code> 读取登录身份。
            本页仅管理<strong>{domainLabel}</strong>的应用内测试角色，与另一工作台角色相互独立。
            {requiresItopsAdmin ? ' 真实平台准入由 Dataverse「Itops Admin」控制。' : ''}
          </p>
        </div>
        <div className="access-header-actions">
          <button className="button button-quiet" type="button" onClick={() => {
            resetToAdminSession(domain)
            setProbeResult(null)
            setNotice({ kind: 'info', message: `已重置「${domainLabel}」为管理员测试会话。` })
          }}>重置为管理员</button>
          <button className="button button-quiet" type="button" disabled={loadingUser || loadingDataverseRoles} onClick={refreshIdentity}>
            {loadingUser || loadingDataverseRoles ? '读取中…' : '重新读取用户'}
          </button>
        </div>
      </header>
      <dl className="access-user-grid">
        <div><dt>显示名</dt><dd>{environmentUser.fullName ?? '—'}</dd></div>
        <div><dt>邮箱 / UPN</dt><dd>{environmentUser.email ?? '—'}</dd></div>
        <div><dt>用户标识</dt><dd className="access-mono">{environmentUser.id ?? '—'}</dd></div>
        <div>
          <dt>来源</dt>
          <dd>
            <StatusBadge
              status={environmentUser.source}
              label={environmentUser.source === 'power-apps' ? 'Power Apps 上下文' : '本地回退'}
              variant={environmentUser.source === 'power-apps' ? 'success' : 'warning'}
              size="small"
            />
          </dd>
        </div>
        <div><dt>本台生效角色</dt><dd>{activeRole.name}</dd></div>
        <div><dt>本台已分配角色</dt><dd>{session.assignedRoleIds.length}</dd></div>
      </dl>
      {environmentUser.error && <p className="access-warning" role="status">{environmentUser.error}</p>}
    </section>

    <section className="access-card">
      <header className="access-card-header">
        <div>
          <h2>{domainLabel}测试角色</h2>
          <p>
            分配角色 = 本工作台可用角色集合；设为生效 = 本台 UI 按该角色门控。
            不会影响另一工作台的角色会话。
          </p>
        </div>
        <div className="access-active-pill">
          当前生效：<strong>{activeRole.name}</strong>
        </div>
      </header>

      {!canManage && <p className="access-warning" role="status">
        当前生效角色没有「{APP_PERMISSION_LABELS[managePermission]}」权限：仍可在已分配角色间切换生效；分配/移除请先切回管理员或点「重置为管理员」。
      </p>}

      <div className="access-role-grid">
        {roleCatalog.map((role) => {
          const assigned = session.assignedRoleIds.includes(role.id)
          const active = session.activeRoleId === role.id
          return <article key={role.id} className={`access-role-card${active ? ' is-active' : ''}${assigned ? ' is-assigned' : ''}`}>
            <div className="access-role-card-head">
              <strong>{role.name}</strong>
              <div className="access-role-badges">
                {assigned && <StatusBadge status="assigned" label="已分配" variant="info" size="small" />}
                {active && <StatusBadge status="active" label="生效中" variant="success" size="small" />}
              </div>
            </div>
            <p>{role.description}</p>
            <small>{role.permissions.length} 项权限</small>
            <div className="access-role-actions">
              <button
                className="button button-quiet inventory-mini-button"
                type="button"
                disabled={!canManage || (assigned && session.assignedRoleIds.length <= 1)}
                onClick={() => toggleAssigned(role.id)}
              >{assigned ? '取消分配' : '分配角色'}</button>
              <button
                className="button button-primary inventory-mini-button"
                type="button"
                disabled={active || (!assigned && !canManage)}
                onClick={() => activateRole(role.id)}
              >{active ? '当前生效' : '设为生效'}</button>
            </div>
          </article>
        })}
      </div>
    </section>

    <section className="access-card">
      <header className="access-card-header">
        <div>
          <h2>权限试探台</h2>
          <p>点击「试探」即时校验本台生效角色；也可跳转到对应页面确认按钮是否可用。</p>
        </div>
        {probeResult && <div className={`access-probe-result${probeResult.allowed ? ' is-allowed' : ' is-denied'}`}>
          {probeResult.allowed ? '允许' : '拒绝'} · {APP_PERMISSION_LABELS[probeResult.permission]}
        </div>}
      </header>
      <div className="access-probe-grid">
        {verifyScenarios.map((scenario) => {
          const allowed = permissions.has(scenario.permission)
          return <article key={scenario.id} className={`access-probe-card${allowed ? ' is-on' : ' is-off'}`}>
            <div className="access-probe-card-head">
              <strong>{scenario.label}</strong>
              <StatusBadge
                status={allowed ? 'allowed' : 'denied'}
                label={allowed ? '已授权' : '无权限'}
                variant={allowed ? 'success' : 'danger'}
                size="small"
              />
            </div>
            <p>{scenario.description}</p>
            <code>{scenario.permission}</code>
            <div className="access-role-actions">
              <button
                className="button button-quiet inventory-mini-button"
                type="button"
                onClick={() => probePermission(scenario.permission)}
              >试探</button>
              {domain === 'inventory' && onNavigateInventory && 'targetView' in scenario && <button
                className="button button-primary inventory-mini-button"
                type="button"
                onClick={() => onNavigateInventory(scenario.targetView as InventoryVerifyView)}
              >去页面验证</button>}
              {domain === 'it-service' && onNavigateItService && <button
                className="button button-primary inventory-mini-button"
                type="button"
                onClick={() => onNavigateItService(scenario.targetView as ItVerifyView)}
              >去页面验证</button>}
            </div>
          </article>
        })}
      </div>
    </section>

    <section className="access-card">
      <header className="access-card-header">
        <div>
          <h2>生效权限清单</h2>
          <p>基于本台生效角色「{activeRole.name}」计算。绿色已授权，灰色禁止。点击芯片可试探。</p>
        </div>
      </header>
      <div className="access-permission-chips">
        {permissionOrder.map((permission) => {
          const granted = permissions.has(permission)
          return <button
            key={permission}
            type="button"
            className={`access-permission-chip${granted ? ' is-on' : ' is-off'}`}
            title={`${permission} · 点击试探`}
            onClick={() => probePermission(permission)}
          >
            {APP_PERMISSION_LABELS[permission]}
          </button>
        })}
      </div>
    </section>

    <section className="access-card">
      <header className="access-card-header">
        <div>
          <h2>角色 × 权限矩阵</h2>
          <p>
            {domain === 'inventory'
              ? '建议测试：管理员 → 作业员 → 只读查看员。'
              : '建议测试：管理员 → 派发调度员 → 一线工程师 → 只读查看员。'}
          </p>
        </div>
      </header>
      <div className="access-matrix-wrap">
        <table className="access-matrix">
          <thead>
            <tr>
              <th>权限</th>
              {matrix.map(({ role }) => <th key={role.id}>{role.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {permissionOrder.map((permission) => <tr key={permission}>
              <th scope="row">{APP_PERMISSION_LABELS[permission]}</th>
              {matrix.map(({ role, granted }) => <td key={`${role.id}-${permission}`}>
                <span className={granted.has(permission) ? 'access-cell-on' : 'access-cell-off'}>
                  {granted.has(permission) ? '✓' : '—'}
                </span>
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section className="access-card access-note-card">
      <h2>给真实用户分配权限需要登录吗？</h2>
      <ol>
        <li><strong>本页（演示）</strong>：改的是当前浏览器 session 里的测试角色，只影响你自己，无需其他账号登录。</li>
        <li><strong>企业发布后</strong>：在 Power Platform / Dataverse 管理中心给用户或团队分配 <strong>Security Role</strong>，对方<strong>不需要先打开本应用</strong>即可完成赋权；下次用自己的 Entra ID 登录应用时生效。</li>
        <li>验证不同人权限：准备多个测试账号分别赋不同角色，各自登录同一环境应用查看差异；前端按钮隐藏只是体验，真正拒绝写操作靠 Dataverse。</li>
      </ol>
    </section>
  </section>
}
