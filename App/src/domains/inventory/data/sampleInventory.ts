import type {
  InventoryBatch,
  InventoryItem,
  InventoryLocation,
  InventoryMovement,
  StocktakeSession,
} from '../types/inventory.types'
import { deriveBatchStatus, deriveInventoryStatus } from '../types/inventory.types'

function item(
  partial: Omit<InventoryItem, 'status' | 'reservedQuantity' | 'unit' | 'notes' | 'createdAt'> & {
    reservedQuantity?: number
    unit?: string
    notes?: string
    createdAt?: string
  },
): InventoryItem {
  const reservedQuantity = partial.reservedQuantity ?? 0
  return {
    unit: '台',
    notes: '',
    createdAt: partial.updatedAt,
    ...partial,
    reservedQuantity,
    status: deriveInventoryStatus(partial.quantity, reservedQuantity, partial.reorderPoint),
  }
}

/** Local mock catalog for inventory workspace reuse demo. */
export const sampleInventoryLocations: InventoryLocation[] = [
  { id: 'loc-a01', code: 'A-01', name: '总部仓 A-01', zone: '总部仓', capacity: 80, manager: '终端支持', isActive: true },
  { id: 'loc-a02', code: 'A-02', name: '总部仓 A-02', zone: '总部仓', capacity: 60, manager: '终端支持', isActive: true },
  { id: 'loc-b04', code: 'B-04', name: '总部仓 B-04', zone: '总部仓', capacity: 40, manager: '服务台', isActive: true },
  { id: 'loc-b11', code: 'B-11', name: '总部仓 B-11', zone: '总部仓', capacity: 50, manager: '终端支持', isActive: true },
  { id: 'loc-s03', code: 'S-03', name: '安全柜 S-03', zone: '安全区', capacity: 30, manager: '安全运营', isActive: true },
  { id: 'loc-mtg', code: 'MTG-01', name: '会议支持仓', zone: '会议区', capacity: 35, manager: '会议支持', isActive: true },
  { id: 'loc-dc', code: 'DC-01', name: '机房备件架', zone: '机房', capacity: 45, manager: '基础架构', isActive: true },
  { id: 'loc-r02', code: 'R-02', name: '维修仓 R-02', zone: '维修区', capacity: 25, manager: '终端支持', isActive: true },
]

export const sampleInventoryItems: InventoryItem[] = [
  item({
    id: 'inv-001', sku: 'NB-14-STD', name: '标准笔记本 14"', category: '终端设备', location: '总部仓 A-01',
    quantity: 18, reorderPoint: 8, owner: '终端支持', updatedAt: '2026-11-07T09:20:00+08:00',
  }),
  item({
    id: 'inv-002', sku: 'MON-27-USB', name: '27" USB-C 显示器', category: '终端设备', location: '总部仓 A-02',
    quantity: 6, reorderPoint: 6, owner: '终端支持', updatedAt: '2026-11-08T14:10:00+08:00',
  }),
  item({
    id: 'inv-003', sku: 'VPN-TOK-01', name: '硬件 VPN Token', category: '安全配件', location: '安全柜 S-03',
    quantity: 0, reorderPoint: 10, owner: '基础架构', unit: '个', updatedAt: '2026-11-06T11:00:00+08:00',
    notes: '待补货，优先保障远程接入项目。',
  }),
  item({
    id: 'inv-004', sku: 'CAM-MTG-4K', name: '会议室 4K 摄像头', category: '会议设备', location: '会议支持仓',
    quantity: 4, reservedQuantity: 2, reorderPoint: 3, owner: '会议支持', updatedAt: '2026-11-08T16:40:00+08:00',
  }),
  item({
    id: 'inv-005', sku: 'DOCK-USB4', name: 'USB4 扩展坞', category: '终端设备', location: '总部仓 B-11',
    quantity: 22, reorderPoint: 10, owner: '终端支持', updatedAt: '2026-11-05T10:15:00+08:00',
  }),
  item({
    id: 'inv-006', sku: 'HDST-ANC', name: '主动降噪耳麦', category: '外设', location: '总部仓 B-04',
    quantity: 3, reorderPoint: 5, owner: '服务台', unit: '副', updatedAt: '2026-11-09T08:30:00+08:00',
  }),
  item({
    id: 'inv-007', sku: 'SW-AP-WIFI6', name: 'Wi-Fi 6 接入点', category: '网络设备', location: '机房备件架',
    quantity: 9, reorderPoint: 4, owner: '基础架构', updatedAt: '2026-11-04T17:05:00+08:00',
  }),
  item({
    id: 'inv-008', sku: 'SSD-1TB-NV', name: '1TB NVMe 固态硬盘', category: '备件', location: '维修仓 R-02',
    quantity: 1, reorderPoint: 4, owner: '终端支持', unit: '块', updatedAt: '2026-11-07T13:25:00+08:00',
  }),
  item({
    id: 'inv-009', sku: 'KB-MX-KEYS', name: '无线办公键盘', category: '外设', location: '总部仓 B-04',
    quantity: 14, reorderPoint: 6, owner: '服务台', unit: '套', updatedAt: '2026-11-03T15:40:00+08:00',
  }),
  item({
    id: 'inv-010', sku: 'SW-CORE-48', name: '48 口核心交换机模块', category: '网络设备', location: '机房备件架',
    quantity: 2, reservedQuantity: 1, reorderPoint: 2, owner: '基础架构', unit: '块', updatedAt: '2026-11-08T09:55:00+08:00',
  }),
  item({
    id: 'inv-011', sku: 'YUBI-5C', name: 'YubiKey 5C NFC', category: '安全配件', location: '安全柜 S-03',
    quantity: 11, reorderPoint: 8, owner: '安全运营', unit: '枚', updatedAt: '2026-11-02T11:20:00+08:00',
  }),
  item({
    id: 'inv-012', sku: 'PROJ-1080', name: '便携投影仪', category: '会议设备', location: '会议支持仓',
    quantity: 5, reorderPoint: 2, owner: '会议支持', updatedAt: '2026-11-01T16:10:00+08:00',
  }),
  item({
    id: 'inv-013', sku: 'RAM-32G-DDR5', name: '32GB DDR5 内存条', category: '备件', location: '维修仓 R-02',
    quantity: 7, reorderPoint: 4, owner: '终端支持', unit: '条', updatedAt: '2026-11-06T18:45:00+08:00',
  }),
  item({
    id: 'inv-014', sku: 'NB-16-PRO', name: '高性能笔记本 16"', category: '终端设备', location: '总部仓 A-01',
    quantity: 0, reorderPoint: 3, owner: '终端支持', updatedAt: '2026-11-09T10:05:00+08:00',
    notes: '开发岗编制扩编，等待采购到货。',
  }),
  item({
    id: 'inv-015', sku: 'CAM-WEB-HD', name: '桌面高清摄像头', category: '外设', location: '总部仓 A-02',
    quantity: 16, reorderPoint: 8, owner: '服务台', updatedAt: '2026-11-05T13:35:00+08:00',
  }),
]

export const sampleInventoryMovements: InventoryMovement[] = [
  {
    id: 'mv-001', number: 'MV-20261109-001', type: 'outbound', itemId: 'inv-006', sku: 'HDST-ANC', itemName: '主动降噪耳麦',
    quantity: 2, fromLocation: '总部仓 B-04', toLocation: null, operator: '服务台 · 周敏',
    reason: '新员工入职领用', relatedWorkOrder: 'WO-1042', occurredAt: '2026-11-09T08:20:00+08:00',
  },
  {
    id: 'mv-002', number: 'MV-20261108-014', type: 'reserve', itemId: 'inv-004', sku: 'CAM-MTG-4K', itemName: '会议室 4K 摄像头',
    quantity: 2, fromLocation: '会议支持仓', toLocation: null, operator: '会议支持 · 陈凯',
    reason: '董事会会议室升级预留', relatedWorkOrder: null, occurredAt: '2026-11-08T16:35:00+08:00',
  },
  {
    id: 'mv-003', number: 'MV-20261108-011', type: 'inbound', itemId: 'inv-002', sku: 'MON-27-USB', itemName: '27" USB-C 显示器',
    quantity: 4, fromLocation: null, toLocation: '总部仓 A-02', operator: '终端支持 · 李倩',
    reason: '采购到货入库', relatedWorkOrder: null, occurredAt: '2026-11-08T14:00:00+08:00',
  },
  {
    id: 'mv-004', number: 'MV-20261108-008', type: 'transfer', itemId: 'inv-010', sku: 'SW-CORE-48', itemName: '48 口核心交换机模块',
    quantity: 1, fromLocation: '总部仓 B-11', toLocation: '机房备件架', operator: '基础架构 · 赵磊',
    reason: '机房扩容调拨', relatedWorkOrder: 'WO-1031', occurredAt: '2026-11-08T09:40:00+08:00',
  },
  {
    id: 'mv-005', number: 'MV-20261107-021', type: 'outbound', itemId: 'inv-001', sku: 'NB-14-STD', itemName: '标准笔记本 14"',
    quantity: 3, fromLocation: '总部仓 A-01', toLocation: null, operator: '终端支持 · 王芳',
    reason: '销售团队设备更换', relatedWorkOrder: 'WO-1028', occurredAt: '2026-11-07T09:05:00+08:00',
  },
  {
    id: 'mv-006', number: 'MV-20261107-018', type: 'adjust', itemId: 'inv-008', sku: 'SSD-1TB-NV', itemName: '1TB NVMe 固态硬盘',
    quantity: -1, fromLocation: '维修仓 R-02', toLocation: '维修仓 R-02', operator: '终端支持 · 王芳',
    reason: '盘点差异校正', relatedWorkOrder: null, occurredAt: '2026-11-07T13:20:00+08:00',
  },
  {
    id: 'mv-007', number: 'MV-20261106-009', type: 'outbound', itemId: 'inv-003', sku: 'VPN-TOK-01', itemName: '硬件 VPN Token',
    quantity: 5, fromLocation: '安全柜 S-03', toLocation: null, operator: '基础架构 · 赵磊',
    reason: '远程办公专项发放', relatedWorkOrder: 'WO-1019', occurredAt: '2026-11-06T10:45:00+08:00',
  },
  {
    id: 'mv-008', number: 'MV-20261106-004', type: 'inbound', itemId: 'inv-013', sku: 'RAM-32G-DDR5', itemName: '32GB DDR5 内存条',
    quantity: 8, fromLocation: null, toLocation: '维修仓 R-02', operator: '终端支持 · 李倩',
    reason: '维修备件补货', relatedWorkOrder: null, occurredAt: '2026-11-06T18:30:00+08:00',
  },
  {
    id: 'mv-009', number: 'MV-20261105-016', type: 'inbound', itemId: 'inv-005', sku: 'DOCK-USB4', itemName: 'USB4 扩展坞',
    quantity: 10, fromLocation: null, toLocation: '总部仓 B-11', operator: '终端支持 · 李倩',
    reason: '季度采购入库', relatedWorkOrder: null, occurredAt: '2026-11-05T10:00:00+08:00',
  },
  {
    id: 'mv-010', number: 'MV-20261105-012', type: 'outbound', itemId: 'inv-015', sku: 'CAM-WEB-HD', itemName: '桌面高清摄像头',
    quantity: 2, fromLocation: '总部仓 A-02', toLocation: null, operator: '服务台 · 周敏',
    reason: '混合办公工位配置', relatedWorkOrder: 'WO-1011', occurredAt: '2026-11-05T13:20:00+08:00',
  },
  {
    id: 'mv-011', number: 'MV-20261104-007', type: 'inbound', itemId: 'inv-007', sku: 'SW-AP-WIFI6', itemName: 'Wi-Fi 6 接入点',
    quantity: 4, fromLocation: null, toLocation: '机房备件架', operator: '基础架构 · 赵磊',
    reason: '楼层覆盖增强采购', relatedWorkOrder: null, occurredAt: '2026-11-04T16:50:00+08:00',
  },
  {
    id: 'mv-012', number: 'MV-20261103-003', type: 'outbound', itemId: 'inv-009', sku: 'KB-MX-KEYS', itemName: '无线办公键盘',
    quantity: 4, fromLocation: '总部仓 B-04', toLocation: null, operator: '服务台 · 周敏',
    reason: '客服中心设备更新', relatedWorkOrder: 'WO-1004', occurredAt: '2026-11-03T15:20:00+08:00',
  },
  {
    id: 'mv-013', number: 'MV-20261102-005', type: 'inbound', itemId: 'inv-011', sku: 'YUBI-5C', itemName: 'YubiKey 5C NFC',
    quantity: 12, fromLocation: null, toLocation: '安全柜 S-03', operator: '安全运营 · 刘洋',
    reason: 'MFA 推广入库', relatedWorkOrder: null, occurredAt: '2026-11-02T11:05:00+08:00',
  },
  {
    id: 'mv-014', number: 'MV-20261101-002', type: 'transfer', itemId: 'inv-012', sku: 'PROJ-1080', itemName: '便携投影仪',
    quantity: 1, fromLocation: '总部仓 A-01', toLocation: '会议支持仓', operator: '会议支持 · 陈凯',
    reason: '培训室设备归位', relatedWorkOrder: null, occurredAt: '2026-11-01T15:55:00+08:00',
  },
  {
    id: 'mv-015', number: 'MV-20261031-001', type: 'release', itemId: 'inv-010', sku: 'SW-CORE-48', itemName: '48 口核心交换机模块',
    quantity: 1, fromLocation: '机房备件架', toLocation: null, operator: '基础架构 · 赵磊',
    reason: '扩容方案变更，释放预留', relatedWorkOrder: null, occurredAt: '2026-10-31T17:10:00+08:00',
  },
]

function batch(
  partial: Omit<InventoryBatch, 'status'> & { status?: InventoryBatch['status'] },
): InventoryBatch {
  return {
    ...partial,
    status: partial.status ?? deriveBatchStatus(partial.quantity, partial.expiresAt),
  }
}

/** Lot / expiry tracking — inventory-specific (not present in IT work-order domain). */
export const sampleInventoryBatches: InventoryBatch[] = [
  batch({
    id: 'lot-001', lotNumber: 'LOT-MON-2408', itemId: 'inv-002', sku: 'MON-27-USB', itemName: '27" USB-C 显示器',
    location: '总部仓 A-02', quantity: 4, receivedAt: '2026-08-12T10:00:00+08:00',
    expiresAt: null, supplier: '联创数码',
  }),
  batch({
    id: 'lot-002', lotNumber: 'LOT-VPN-2501', itemId: 'inv-003', sku: 'VPN-TOK-01', itemName: '硬件 VPN Token',
    location: '安全柜 S-03', quantity: 0, receivedAt: '2025-01-20T09:00:00+08:00',
    expiresAt: '2026-10-15T00:00:00+08:00', supplier: '安联科技',
  }),
  batch({
    id: 'lot-003', lotNumber: 'LOT-SSD-2603', itemId: 'inv-008', sku: 'SSD-1TB-NV', itemName: '1TB NVMe 固态硬盘',
    location: '维修仓 R-02', quantity: 1, receivedAt: '2026-03-08T14:20:00+08:00',
    expiresAt: '2026-11-25T00:00:00+08:00', supplier: '迅存电子',
  }),
  batch({
    id: 'lot-004', lotNumber: 'LOT-YUBI-2602', itemId: 'inv-011', sku: 'YUBI-5C', itemName: 'YubiKey 5C NFC',
    location: '安全柜 S-03', quantity: 8, receivedAt: '2026-02-18T11:00:00+08:00',
    expiresAt: '2026-12-01T00:00:00+08:00', supplier: '身份安全供应商',
  }),
  batch({
    id: 'lot-005', lotNumber: 'LOT-RAM-2506', itemId: 'inv-013', sku: 'RAM-32G-DDR5', itemName: '32GB DDR5 内存条',
    location: '维修仓 R-02', quantity: 5, receivedAt: '2025-06-30T16:00:00+08:00',
    expiresAt: '2026-11-18T00:00:00+08:00', supplier: '迅存电子',
  }),
  batch({
    id: 'lot-006', lotNumber: 'LOT-HDST-2609', itemId: 'inv-006', sku: 'HDST-ANC', itemName: '主动降噪耳麦',
    location: '总部仓 B-04', quantity: 3, receivedAt: '2026-09-02T10:30:00+08:00',
    expiresAt: null, supplier: '声临科技',
  }),
  batch({
    id: 'lot-007', lotNumber: 'LOT-NB14-2511', itemId: 'inv-001', sku: 'NB-14-STD', itemName: '标准笔记本 14"',
    location: '总部仓 A-01', quantity: 10, receivedAt: '2025-11-12T09:40:00+08:00',
    expiresAt: null, supplier: '联创数码',
  }),
  batch({
    id: 'lot-008', lotNumber: 'LOT-CAM-2604', itemId: 'inv-004', sku: 'CAM-MTG-4K', itemName: '会议室 4K 摄像头',
    location: '会议支持仓', quantity: 2, receivedAt: '2026-04-22T13:15:00+08:00',
    expiresAt: '2027-04-22T00:00:00+08:00', supplier: '视界互联',
  }),
]

export const sampleStocktakeSessions: StocktakeSession[] = [
  {
    id: 'st-001',
    number: 'ST-20261108-01',
    location: '维修仓 R-02',
    status: 'counting',
    operator: '终端支持 · 王芳',
    startedAt: '2026-11-08T09:00:00+08:00',
    updatedAt: '2026-11-09T10:20:00+08:00',
    postedAt: null,
    notes: '月度备件盘点',
    lines: [
      {
        itemId: 'inv-008', sku: 'SSD-1TB-NV', itemName: '1TB NVMe 固态硬盘',
        systemQuantity: 1, countedQuantity: 1, unit: '块',
      },
      {
        itemId: 'inv-013', sku: 'RAM-32G-DDR5', itemName: '32GB DDR5 内存条',
        systemQuantity: 7, countedQuantity: 6, unit: '条',
      },
    ],
  },
  {
    id: 'st-002',
    number: 'ST-20261101-02',
    location: '安全柜 S-03',
    status: 'posted',
    operator: '安全运营 · 刘洋',
    startedAt: '2026-11-01T14:00:00+08:00',
    updatedAt: '2026-11-01T16:40:00+08:00',
    postedAt: '2026-11-01T16:40:00+08:00',
    notes: 'MFA 设备抽盘',
    lines: [
      {
        itemId: 'inv-003', sku: 'VPN-TOK-01', itemName: '硬件 VPN Token',
        systemQuantity: 0, countedQuantity: 0, unit: '个',
      },
      {
        itemId: 'inv-011', sku: 'YUBI-5C', itemName: 'YubiKey 5C NFC',
        systemQuantity: 11, countedQuantity: 11, unit: '枚',
      },
    ],
  },
]
