import { useEffect, useState } from 'react'
import { DetailPanel, StatusBadge, Timeline } from '../../../shared/components'
import { getAssignmentApprovalStatusLabel } from '../config/assignmentApprovalChoices'
import { getAvailableStatusTransitions } from '../config/workOrderChoices'
import { loadAssignmentApprovalRequests, type AssignmentApprovalRequest } from '../services/assignmentApprovalRepository'
import { WORK_ORDER_STATUS, type WorkOrder, type WorkOrderStatus, type WorkOrderStoreState } from '../types/workOrder.types'
import { formatDate } from '../utils/formatDate'
import { RelatedMaterialsPanel } from './RelatedMaterialsPanel'
import { Avatar, PriorityLabel, StatusPill } from './WorkOrderBadges'

export interface WorkOrderDetailPanelProps {
  workOrder: WorkOrder
  state: WorkOrderStoreState
  disabled: boolean
  canEdit?: boolean
  canAssignAction?: boolean
  canUnassignAction?: boolean
  canChangeStatus?: boolean
  onClose: () => void
  onEdit: () => void
  onAssign: () => void
  onUnassign: () => void
  onChangeStatus: () => void
}

export function WorkOrderDetailPanel({
  workOrder,
  state,
  disabled,
  canEdit = true,
  canAssignAction = true,
  canUnassignAction = true,
  canChangeStatus = true,
  onClose,
  onEdit,
  onAssign,
  onUnassign,
  onChangeStatus,
}: WorkOrderDetailPanelProps) {
  const [approvalRequests, setApprovalRequests] = useState<AssignmentApprovalRequest[]>([])
  const [approvalRequestsLoading, setApprovalRequestsLoading] = useState(false)
  const [approvalRequestsError, setApprovalRequestsError] = useState<string | null>(null)
  const timeline = (state.events ?? []).filter((event) => event.workOrderId === workOrder.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const assignments = (state.assignments ?? []).filter((assignment) => assignment.workOrderId === workOrder.id)
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))

  useEffect(() => {
    let active = true
    setApprovalRequestsLoading(true)
    setApprovalRequestsError(null)
    loadAssignmentApprovalRequests(workOrder.id)
      .then((requests) => { if (active) setApprovalRequests(requests) })
      .catch((error: unknown) => {
        if (active) setApprovalRequestsError(error instanceof Error ? error.message : '读取审批申请失败。')
      })
      .finally(() => { if (active) setApprovalRequestsLoading(false) })
    return () => { active = false }
  }, [workOrder.id])

  const terminal = workOrder.status === WORK_ORDER_STATUS.closed || workOrder.status === WORK_ORDER_STATUS.cancelled
  const canAssign = ([WORK_ORDER_STATUS.new, WORK_ORDER_STATUS.assigned, WORK_ORDER_STATUS.inProgress, WORK_ORDER_STATUS.onHold] as readonly WorkOrderStatus[]).includes(workOrder.status)
  const canUnassign = workOrder.status === WORK_ORDER_STATUS.assigned && Boolean(workOrder.assignedToId)
  const canTransition = getAvailableStatusTransitions(workOrder).length > 0

  return <DetailPanel open title="工单详情" subtitle={workOrder.workOrderNumber || '编号生成中'} size="large" onClose={onClose}>
    <div className="detail-title-row"><StatusPill status={workOrder.status} /><PriorityLabel priority={workOrder.priority} /></div>
    <h2 className="detail-title">{workOrder.workOrderName}</h2>
    <p className="detail-description">{workOrder.issueDescription || '暂无问题描述'}</p>
    <div className="detail-actions">
      {!terminal && <button
        className="button button-quiet"
        disabled={disabled || !canEdit}
        title={!canEdit ? '当前角色无编辑工单权限' : undefined}
        onClick={onEdit}
      >编辑</button>}
      {canAssign && <button
        className="button button-primary"
        disabled={disabled || !canAssignAction || (state.employees ?? []).filter((item) => item.isActive && item.isAvailableForOrder).length === 0}
        title={!canAssignAction ? '当前角色无派发权限' : undefined}
        onClick={onAssign}
      >
        {workOrder.assignedToId ? '转派' : '派发'}
      </button>}
      {canUnassign && <button
        className="button button-quiet"
        disabled={disabled || !canUnassignAction}
        title={!canUnassignAction ? '当前角色无撤派权限' : undefined}
        onClick={onUnassign}
      >撤派</button>}
      {canTransition && <button
        className="button button-quiet"
        disabled={disabled || !canChangeStatus}
        title={!canChangeStatus ? '当前角色无变更状态权限' : undefined}
        onClick={onChangeStatus}
      >更新状态</button>}
    </div>

    <section className="detail-section"><div className="section-heading"><h3>工单字段</h3><span>WORK ORDER</span></div>
      <dl className="detail-grid">
        <div><dt>工单编号</dt><dd>{workOrder.workOrderNumber || '待生成'}</dd></div>
        <div><dt>工单标题</dt><dd>{workOrder.workOrderName}</dd></div>
        <div><dt>当前状态</dt><dd><StatusPill status={workOrder.status} /></dd></div>
        <div><dt>优先级</dt><dd><PriorityLabel priority={workOrder.priority} /></dd></div>
        <div><dt>当前负责人</dt><dd className="person-value"><Avatar small name={workOrder.assignedToName} />{workOrder.assignedToName ?? '待分派'}</dd></div>
        <div><dt>负责部门</dt><dd>{workOrder.department || '未指定'}</dd></div>
        <div><dt>服务类别</dt><dd>{workOrder.serviceCategoryLabel ?? '未设置'}</dd></div>
        <div><dt>创建时间</dt><dd>{formatDate(workOrder.createTime)}</dd></div>
        <div><dt>预计完成</dt><dd>{formatDate(workOrder.expectedCompletionTime)}</dd></div>
        <div><dt>解决时间</dt><dd>{formatDate(workOrder.resolvedAt)}</dd></div>
        <div><dt>关闭时间</dt><dd>{formatDate(workOrder.closedAt)}</dd></div>
        <div><dt>创建人</dt><dd>{workOrder.createdBy ?? '—'}</dd></div>
        <div><dt>最后修改</dt><dd>{formatDate(workOrder.modifiedAt)}</dd></div>
      </dl>
    </section>

    <section className="detail-section"><div className="section-heading"><h3>解决方案</h3><span>{workOrder.resolution ? '已记录' : '未记录'}</span></div>
      <p className="resolution-card">{workOrder.resolution || '尚未记录解决方案'}</p>
    </section>

    <RelatedMaterialsPanel workOrderNumber={workOrder.workOrderNumber} serviceCategory={workOrder.serviceCategoryLabel} />

    <section className="detail-section"><div className="section-heading"><h3>派发记录</h3><span>{assignments.length} RECORDS</span></div>
      {assignments.length > 0 ? <div className="assignment-list">{assignments.map((assignment) => <article className="assignment-row" key={assignment.id}>
        <span className="assignment-mark">↗</span><div><strong>{assignment.assignmentTypeLabel ?? assignment.assignmentType}</strong>
          <p>{assignment.assignedFromName ? `${assignment.assignedFromName} → ` : ''}{assignment.assignedToName ?? '未分派'}{assignment.assignmentNote ? ` · ${assignment.assignmentNote}` : ''}</p>
          <small>{assignment.assignmentNumber || '派发编号待生成'} · {assignment.assignmentSourceLabel ?? assignment.assignmentSource ?? '—'} · 操作人：{assignment.createdBy ?? '—'}</small>
        </div><time>{formatDate(assignment.assignedAt)}</time>
      </article>)}</div> : <p className="empty-history">暂无派发记录</p>}
    </section>

    <section className="detail-section"><div className="section-heading"><h3>负责人变更审批</h3><span>{approvalRequests.length} REQUESTS</span></div>
      {approvalRequestsLoading && <p className="empty-history" role="status">正在读取审批申请…</p>}
      {!approvalRequestsLoading && approvalRequestsError && <p className="approval-request-error" role="alert">{approvalRequestsError}</p>}
      {!approvalRequestsLoading && !approvalRequestsError && approvalRequests.length === 0 && <p className="empty-history">暂无负责人变更申请</p>}
      {!approvalRequestsLoading && !approvalRequestsError && approvalRequests.length > 0 && <div className="approval-request-list">
        {approvalRequests.map((request) => <article className="approval-request-row" key={request.id}>
          <div className="approval-request-heading"><strong>{request.requestNumber || '申请编号生成中'}</strong>
            <StatusBadge status={request.status} label={getAssignmentApprovalStatusLabel(request.status)} size="small" /></div>
          <p>{request.originalAssignedToName ?? '未知原负责人'} → {request.requestedAssignedToName ?? '未知目标负责人'}</p>
          {request.reason && <small>原因：{request.reason}</small>}
          {request.approvalComments && <small>审批意见：{request.approvalComments}</small>}
          {request.errorDetail && <small className="approval-request-error">处理信息：{request.errorDetail}</small>}
          <time>{formatDate(request.completedAt ?? request.submittedAt)}</time>
        </article>)}
      </div>}
    </section>

    <section className="detail-section"><div className="section-heading"><h3>工单历史</h3><span>{timeline.length} RECORDS</span></div>
      <Timeline
        ariaLabel="工单历史时间线"
        emptyLabel="这张工单暂无已读取的历史记录"
        items={timeline.map((event) => ({
          id: event.id,
          title: event.historyTypeLabel ?? event.kind,
          description: event.description,
          tone: event.kind,
          time: formatDate(event.occurredAt),
          meta: <>
            {(event.previousStatusLabel || event.newStatusLabel || event.historyStatusLabel) && <small>
              历史状态映射：{event.previousStatusLabel ?? '—'} → {event.newStatusLabel ?? '—'}{event.historyStatusLabel ? ` · 记录状态：${event.historyStatusLabel}` : ''}
            </small>}
            {event.remarks && <small>备注：{event.remarks}</small>}
            <small>{event.historyNumber || '历史编号待生成'} · 操作人：{event.createdBy ?? '—'}</small>
          </>,
        }))}
      />
    </section>
  </DetailPanel>
}
