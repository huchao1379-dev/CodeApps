import type { TableColumn } from '../../../shared/components'
import type { WorkOrder } from '../types/workOrder.types'
import { formatDate } from '../utils/formatDate'
import { Avatar, PriorityLabel, StatusPill } from './WorkOrderBadges'

export const workOrderColumns: TableColumn<WorkOrder>[] = [
  {
    key: 'workOrderName',
    title: '工单',
    width: 280,
    sortable: true,
    render: (_, workOrder) => <div className="work-order-cell">
      <span><strong>{workOrder.workOrderName}</strong><small>{workOrder.workOrderNumber || '编号待生成'}</small></span>
    </div>,
  },
  {
    key: 'status',
    title: '状态',
    width: 105,
    sortable: true,
    render: (_, workOrder) => <StatusPill status={workOrder.status} />,
  },
  {
    key: 'priority',
    title: '优先级',
    width: 95,
    sortable: true,
    render: (_, workOrder) => <PriorityLabel priority={workOrder.priority} />,
  },
  { key: 'serviceCategoryLabel', title: '服务类别', width: 135, sortable: true },
  {
    key: 'department',
    title: '负责部门',
    width: 125,
    sortable: true,
    render: (value) => <span className="department-cell">{String(value || '—')}</span>,
  },
  {
    key: 'assignedToName',
    title: '负责人',
    width: 135,
    sortable: true,
    render: (_, workOrder) => <div className="assignee-cell">
      <Avatar small name={workOrder.assignedToName} /><span>{workOrder.assignedToName ?? '待分派'}</span>
    </div>,
  },
  {
    key: 'expectedCompletionTime',
    title: '预计完成',
    width: 140,
    sortable: true,
    render: (_, workOrder) => <span className="date-cell">{formatDate(workOrder.expectedCompletionTime)}</span>,
  },
  {
    key: 'createTime',
    title: '创建时间',
    width: 150,
    sortable: true,
    render: (_, workOrder) => <span className="date-cell">{formatDate(workOrder.createTime)}</span>,
  },
]
