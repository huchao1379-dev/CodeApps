import { useEffect, useMemo, useState } from 'react'
import { DataTable, DetailPanel, Pagination, SearchInput, StatusBadge } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components'
import { loadAllAssignmentApprovalRequests, type AssignmentApprovalRequest } from '../services/assignmentApprovalRepository'
import { assignmentApprovalStatusOptions, getAssignmentApprovalStatusLabel, type AssignmentApprovalStatus } from '../config/assignmentApprovalChoices'
import './AssignmentApprovalRequestsPage.css'

const formatDate = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function ApprovalStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} label={getAssignmentApprovalStatusLabel(status)} size="small" />
}

const columns: TableColumn<AssignmentApprovalRequest>[] = [
  { key: 'requestNumber', title: '申请编号', width: 150, sortable: true, render: (_, request) => <strong className="approval-request-number">{request.requestNumber || '编号生成中'}</strong> },
  { key: 'workOrderLabel', title: '关联工单', width: 190, sortable: true, render: (_, request) => <span className="approval-work-order">{request.workOrderLabel || request.workOrderId || '工单信息不可用'}</span> },
  { key: 'originalAssignedToName', title: '原负责人', width: 130, render: (_, request) => request.originalAssignedToName || '—' },
  { key: 'requestedAssignedToName', title: '目标负责人', width: 130, render: (_, request) => request.requestedAssignedToName || '—' },
  { key: 'status', title: '状态', width: 105, sortable: true, render: (_, request) => <ApprovalStatusBadge status={request.status} /> },
  { key: 'submittedAt', title: '提交时间', width: 170, sortable: true, render: (_, request) => <span className="approval-date">{formatDate(request.submittedAt)}</span> },
  { key: 'requesterName', title: '申请人', width: 125, render: (_, request) => request.requesterName || request.requesterEmail || '—' },
]

export interface AssignmentApprovalRequestsPageProps {
  active: boolean
  refreshToken: number
  onRefresh: () => void
  onOpenWorkOrder: (workOrderId: string) => void
}

export function AssignmentApprovalRequestsPage({ active, refreshToken, onRefresh, onOpenWorkOrder }: AssignmentApprovalRequestsPageProps) {
  const [requests, setRequests] = useState<AssignmentApprovalRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AssignmentApprovalStatus>('all')
  const [sort, setSort] = useState<Array<{ field: string; direction: 'asc' | 'desc' }>>([{ field: 'submittedAt', direction: 'desc' }])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return undefined
    let mounted = true
    setLoading(true)
    setError(null)
    loadAllAssignmentApprovalRequests()
      .then((nextRequests) => { if (mounted) setRequests(nextRequests) })
      .catch((loadError: unknown) => { if (mounted) setError(loadError instanceof Error ? loadError.message : '读取负责人变更申请失败。') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [active, refreshToken])

  const counts = useMemo(() => assignmentApprovalStatusOptions.slice(1).reduce<Record<string, number>>((summary, option) => {
    const status = option.value
    summary[status] = requests.filter((request) => request.status === status).length
    return summary
  }, {}), [requests])

  const visibleRequests = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    const filtered = requests.filter((request) => {
      const searchable = [request.requestNumber, request.workOrderLabel, request.originalAssignedToName, request.requestedAssignedToName, request.requesterName, request.requesterEmail, request.reason]
        .filter(Boolean).join(' ').toLocaleLowerCase()
      return (!needle || searchable.includes(needle)) && (statusFilter === 'all' || request.status === statusFilter)
    })
    const activeSort = sort[0]
    if (!activeSort) return filtered
    return [...filtered].sort((left, right) => {
      const leftValue = left[activeSort.field as keyof AssignmentApprovalRequest]
      const rightValue = right[activeSort.field as keyof AssignmentApprovalRequest]
      const comparison = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'zh-CN', { numeric: true })
      return activeSort.direction === 'asc' ? comparison : -comparison
    })
  }, [requests, search, statusFilter, sort])
  const pageCount = Math.max(1, Math.ceil(visibleRequests.length / pageSize))
  const pageRequests = visibleRequests.slice((page - 1) * pageSize, page * pageSize)
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null

  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount])

  return <section className="approval-page" aria-labelledby="approval-page-title">
    <header className="approval-page-toolbar">
      <div>
        <span className="approval-page-eyebrow">APPROVAL OPERATIONS</span>
        <h2 id="approval-page-title">申请列表</h2>
        <p>选择一条记录查看申请原因和审批结果，也可直接打开关联工单。</p>
      </div>
      <button className="button button-quiet" type="button" onClick={onRefresh} disabled={loading}>↻ 重新读取</button>
    </header>

    <div className="approval-summary" aria-label="申请状态统计">
      <article><span>全部申请</span><strong>{requests.length}</strong><small>当前身份可读取</small></article>
      <article className="approval-summary-pending"><span>待审批</span><strong>{counts.Pending ?? 0}</strong><small>等待审批处理</small></article>
      <article className="approval-summary-approved"><span>已通过</span><strong>{counts.Approved ?? 0}</strong><small>已完成负责人变更</small></article>
      <article className="approval-summary-risk"><span>需关注</span><strong>{(counts.Rejected ?? 0) + (counts.Conflict ?? 0) + (counts.Failed ?? 0)}</strong><small>拒绝、冲突或失败</small></article>
    </div>

    <section className="approval-table-card">
      <header className="approval-table-toolbar">
        <div className="approval-filter-search"><SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1) }} onSearch={(value) => { setSearch(value); setPage(1) }} onClear={() => { setSearch(''); setPage(1) }} placeholder="搜索申请编号、工单或负责人" ariaLabel="搜索负责人变更申请" /></div>
        <label className="approval-status-filter">状态
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as 'all' | AssignmentApprovalStatus); setPage(1) }}>
            {assignmentApprovalStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <span className="approval-result-count">显示 {visibleRequests.length} / {requests.length}</span>
      </header>
      <DataTable data={pageRequests} columns={columns} rowKey={(request) => request.id} ariaLabel="负责人变更申请列表"
        loading={loading} loadingLabel="正在读取负责人变更申请…" error={!loading ? error : null} onRetry={onRefresh}
        emptyTitle={requests.length === 0 ? '暂无负责人变更申请' : '没有匹配的申请'}
        emptyDescription={requests.length === 0 ? '当工单已有负责人时提交转派，会在这里生成审批申请。' : '调整搜索关键词或状态筛选。'}
        onRowClick={(request) => setSelectedRequestId(request.id)}
        sort={sort} onSortChange={setSort} />
      <footer className="approval-table-footer"><span>显示 {visibleRequests.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleRequests.length)} / {visibleRequests.length}</span>
        <Pagination page={page} pageSize={pageSize} total={visibleRequests.length} loading={loading} pageSizeOptions={[10, 20, 50]}
          onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
      </footer>
    </section>
    <DetailPanel open={Boolean(selectedRequest)} title="负责人变更申请详情" subtitle={selectedRequest?.requestNumber || undefined} size="medium" onClose={() => setSelectedRequestId(null)}
      footer={selectedRequest?.workOrderId ? <button className="button button-primary" type="button" onClick={() => { onOpenWorkOrder(selectedRequest.workOrderId!); setSelectedRequestId(null) }}>打开关联工单</button> : undefined}>
      {selectedRequest && <div className="approval-request-detail">
        <div className="approval-request-detail-status"><span>审批状态</span><ApprovalStatusBadge status={selectedRequest.status} /></div>
        <dl>
          <div><dt>关联工单</dt><dd>{selectedRequest.workOrderLabel || selectedRequest.workOrderId || '—'}</dd></div>
          <div><dt>原负责人</dt><dd>{selectedRequest.originalAssignedToName || '—'}</dd></div>
          <div><dt>目标负责人</dt><dd>{selectedRequest.requestedAssignedToName || '—'}</dd></div>
          <div><dt>申请人</dt><dd>{selectedRequest.requesterName || '—'}</dd></div>
          <div><dt>申请人邮箱</dt><dd>{selectedRequest.requesterEmail || '—'}</dd></div>
          <div><dt>提交时间</dt><dd>{formatDate(selectedRequest.submittedAt)}</dd></div>
          <div><dt>完成时间</dt><dd>{formatDate(selectedRequest.completedAt)}</dd></div>
          <div className="approval-detail-wide"><dt>申请原因</dt><dd>{selectedRequest.reason || '—'}</dd></div>
          <div className="approval-detail-wide"><dt>审批意见</dt><dd>{selectedRequest.approvalComments || '—'}</dd></div>
          {selectedRequest.errorDetail && <div className="approval-detail-wide approval-detail-error"><dt>处理信息</dt><dd>{selectedRequest.errorDetail}</dd></div>}
        </dl>
      </div>}
    </DetailPanel>
  </section>
}
