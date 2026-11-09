import type { InventoryItem } from '../types/inventory.types'

/** Local sample set for framework-reuse demo (no Dataverse inventory tables yet). */
export const sampleInventoryItems: InventoryItem[] = [
  {
    id: 'inv-001', sku: 'NB-14-STD', name: '标准笔记本 14"', category: '终端设备', location: '总部仓 A-01',
    quantity: 18, reorderPoint: 8, status: 'in-stock', owner: '终端支持', updatedAt: '2026-11-07T09:20:00+08:00',
  },
  {
    id: 'inv-002', sku: 'MON-27-USB', name: '27" USB-C 显示器', category: '终端设备', location: '总部仓 A-02',
    quantity: 6, reorderPoint: 6, status: 'low', owner: '终端支持', updatedAt: '2026-11-08T14:10:00+08:00',
  },
  {
    id: 'inv-003', sku: 'VPN-TOK-01', name: '硬件 VPN Token', category: '安全配件', location: '安全柜 S-03',
    quantity: 0, reorderPoint: 10, status: 'out', owner: '基础架构', updatedAt: '2026-11-06T11:00:00+08:00',
  },
  {
    id: 'inv-004', sku: 'CAM-MTG-4K', name: '会议室 4K 摄像头', category: '会议设备', location: '会议支持仓',
    quantity: 4, reorderPoint: 3, status: 'reserved', owner: '会议支持', updatedAt: '2026-11-08T16:40:00+08:00',
  },
  {
    id: 'inv-005', sku: 'DOCK-USB4', name: 'USB4 扩展坞', category: '终端设备', location: '总部仓 B-11',
    quantity: 22, reorderPoint: 10, status: 'in-stock', owner: '终端支持', updatedAt: '2026-11-05T10:15:00+08:00',
  },
  {
    id: 'inv-006', sku: 'HDST-ANC', name: '主动降噪耳麦', category: '外设', location: '总部仓 B-04',
    quantity: 3, reorderPoint: 5, status: 'low', owner: '服务台', updatedAt: '2026-11-09T08:30:00+08:00',
  },
  {
    id: 'inv-007', sku: 'SW-AP-WIFI6', name: 'Wi-Fi 6 接入点', category: '网络设备', location: '机房备件架',
    quantity: 9, reorderPoint: 4, status: 'in-stock', owner: '基础架构', updatedAt: '2026-11-04T17:05:00+08:00',
  },
  {
    id: 'inv-008', sku: 'SSD-1TB-NV', name: '1TB NVMe 固态硬盘', category: '备件', location: '维修仓 R-02',
    quantity: 1, reorderPoint: 4, status: 'low', owner: '终端支持', updatedAt: '2026-11-07T13:25:00+08:00',
  },
]
