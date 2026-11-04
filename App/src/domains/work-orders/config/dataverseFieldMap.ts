/** Column and relationship schema names generated from this app's Dataverse environment. */
export const workOrderFieldMap = {
  workOrderName: 'cr590_WorkOrderName',
  issueDescription: 'cr590_IssueDescription',
  workOrderNumber: 'cr590_WorkOrderNumber',
  priority: 'cr590_Priority',
  status: 'cr590_Status',
  assignedTo: 'cr590_AssignedTo',
  department: 'cr590_Department',
  serviceCategory: 'cr590_ServiceCategory',
  createTime: 'cr590_CreateTime',
  expectedCompletionTime: 'cr590_ExpectedCompletionTime',
  resolution: 'cr590_Resolution',
  resolvedAt: 'cr590_ResolvedAt',
  closedAt: 'cr590_ClosedAt',
} as const

/** WorkOrder.Status is authoritative. These legacy columns are intentionally not written. */
export const nonAuthoritativeWorkOrderColumns = {
  duplicateStatus: 'cr590_WorkOrderStatus',
  duplicateHandlerText: 'cr590_CurrentHandler',
} as const

export const assignmentFieldMap = {
  assignedAt: 'cr590_AssignedAt',
  assignedFrom: 'cr590_AssignedFrom',
  assignedTo: 'cr590_AssignedTo',
  assignmentName: 'cr590_AssignmentName',
  assignmentNote: 'cr590_AssignmentNote',
  assignmentNumber: 'cr590_AssignmentNumber',
  assignmentSource: 'cr590_AssignmentSource',
  assignmentType: 'cr590_AssignmentType',
  workOrder: 'cr590_WorkOrder',
} as const

export const workOrderHistoryFieldMap = {
  changedAt: 'cr590_ChangedAt',
  changeDescription: 'cr590_ChangeDescription',
  historyNumber: 'cr590_HistoryNumber',
  historyType: 'cr590_HistoryType',
  newStatus: 'cr590_NewStatus',
  previousStatus: 'cr590_PreviousStatus',
  remarks: 'cr590_Remarks',
  status: 'cr590_Status',
  workOrder: 'cr590_WorkOrder',
  workOrderNumber: 'cr590_WorkOrderNumber',
} as const

export const employeeFieldMap = {
  age: 'cr590_Age',
  employeeName: 'cr590_EmployeeName',
  email: 'cr590_Email',
  department: 'cr590_Department',
  gender: 'cr590_Gender',
  hireDate: 'cr590_HireDate',
  isActive: 'cr590_IsActive',
  isAvailableForOrder: 'cr590_IsAvailableForOrder',
  maxTaskLoad: 'cr590_MaxTaskLoad',
  skills: 'cr590_Skills',
} as const

export const departmentFieldMap = {
  // The existing environment column/schema has this spelling; do not "correct" it in Web API queries.
  departmentCode: 'cr590_DeparmentCode',
  departmentName: 'cr590_DepartmentName',
  description: 'cr590_Description',
  establishedDate: 'cr590_EstablishedDate',
  manager: 'cr590_Manager',
} as const

export const serviceCategoryFieldMap = {
  categoryCode: 'cr590_CategoryCode',
  defaultDepartment: 'cr590_DefaultDepartment',
  defaultPriority: 'cr590_DefaultPriority',
  description: 'cr590_Description',
  isActive: 'cr590_IsActive',
  serviceCategoryName: 'cr590_ServiceCategoryName',
} as const
