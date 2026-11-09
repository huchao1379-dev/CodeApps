import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useOverlayFocus } from '../../../shared/components'
import {
  INVENTORY_CATEGORIES,
  INVENTORY_OWNERS,
  availableQuantity,
  type InventoryItem,
  type InventoryItemInput,
  type InventoryLocation,
} from '../types/inventory.types'

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useOverlayFocus<HTMLElement>(true, onClose)
  return <div className="modal-backdrop inventory-modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section ref={dialogRef} tabIndex={-1} className="modal-card inventory-modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" onClick={onClose}>×</button>
      </header>
      {children}
    </section>
  </div>
}

const emptyItemForm = (): InventoryItemInput => ({
  sku: '',
  name: '',
  category: INVENTORY_CATEGORIES[0],
  location: '',
  quantity: 0,
  reorderPoint: 1,
  owner: INVENTORY_OWNERS[0],
  unit: '台',
  notes: '',
})

export function InventoryItemFormDialog({
  open,
  item,
  locations,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  item: InventoryItem | null
  locations: InventoryLocation[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: InventoryItemInput) => void
}) {
  const [form, setForm] = useState<InventoryItemInput>(emptyItemForm)
  const activeLocations = useMemo(() => locations.filter((location) => location.isActive), [locations])

  useEffect(() => {
    if (!open) return
    if (item) {
      setForm({
        sku: item.sku,
        name: item.name,
        category: item.category,
        location: item.location,
        quantity: item.quantity,
        reorderPoint: item.reorderPoint,
        owner: item.owner,
        unit: item.unit,
        notes: item.notes,
      })
      return
    }
    setForm({
      ...emptyItemForm(),
      location: activeLocations[0]?.name ?? '',
    })
  }, [open, item, activeLocations])

  if (!open) return null

  return <ModalShell
    title={item ? '编辑物资' : '新建物资'}
    subtitle={item ? item.sku : '创建后写入本地 mock 台账'}
    onClose={onClose}
  >
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      onSubmit({
        ...form,
        sku: form.sku.trim(),
        name: form.name.trim(),
        notes: form.notes.trim(),
        unit: form.unit.trim() || '台',
      })
    }}>
      <div className="modal-content">
        <div className="form-row">
          <label>SKU<b>*</b>
            <input required maxLength={40} value={form.sku} disabled={Boolean(item)}
              onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} />
          </label>
          <label>单位
            <input maxLength={10} value={form.unit}
              onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} />
          </label>
        </div>
        <label>物资名称<b>*</b>
          <input required maxLength={120} value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <div className="form-row">
          <label>类别<b>*</b>
            <select required value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
              {INVENTORY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>责任组<b>*</b>
            <select required value={form.owner}
              onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}>
              {INVENTORY_OWNERS.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>库位<b>*</b>
            <select required value={form.location}
              onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}>
              {activeLocations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
            </select>
          </label>
          <label>警戒线<b>*</b>
            <input required type="number" min={0} value={form.reorderPoint}
              onChange={(event) => setForm((current) => ({ ...current, reorderPoint: Number(event.target.value) }))} />
          </label>
        </div>
        {!item && <label>初始数量
          <input type="number" min={0} value={form.quantity}
            onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} />
        </label>}
        <label>备注
          <textarea rows={3} maxLength={400} value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? '保存中…' : '保存'}</button>
      </footer>
    </form>
  </ModalShell>
}

type StockActionKind = 'receive' | 'issue' | 'adjust' | 'transfer' | 'reserve' | 'release'

const STOCK_ACTION_COPY: Record<StockActionKind, { title: string; subtitle: string; quantityLabel: string; reasonLabel: string }> = {
  receive: { title: '入库', subtitle: '增加库存数量并写入流水', quantityLabel: '入库数量', reasonLabel: '入库原因' },
  issue: { title: '领用出库', subtitle: '扣减可用库存并写入流水', quantityLabel: '领用数量', reasonLabel: '领用原因' },
  adjust: { title: '库存调整', subtitle: '支持正负校正，需填写原因', quantityLabel: '调整数量（可负）', reasonLabel: '调整原因' },
  transfer: { title: '库位调拨', subtitle: '整批或部分调拨到其他库位', quantityLabel: '调拨数量', reasonLabel: '调拨原因' },
  reserve: { title: '预留库存', subtitle: '占用可用数量，不减少账面总量', quantityLabel: '预留数量', reasonLabel: '预留原因' },
  release: { title: '释放预留', subtitle: '释放已预留数量回到可用库存', quantityLabel: '释放数量', reasonLabel: '释放原因' },
}

export function InventoryStockActionDialog({
  open,
  kind,
  item,
  locations,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  kind: StockActionKind | null
  item: InventoryItem | null
  locations: InventoryLocation[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: {
    quantity: number
    reason: string
    operator: string
    toLocation?: string
    relatedWorkOrder?: string
  }) => void
}) {
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [operator, setOperator] = useState('库存管理员')
  const [toLocation, setToLocation] = useState('')
  const [relatedWorkOrder, setRelatedWorkOrder] = useState('')

  useEffect(() => {
    if (!open || !kind || !item) return
    setReason('')
    setOperator('库存管理员')
    setRelatedWorkOrder('')
    setToLocation(locations.find((location) => location.isActive && location.name !== item.location)?.name ?? '')
    if (kind === 'adjust') setQuantity(1)
    else if (kind === 'release') setQuantity(Math.max(1, item.reservedQuantity))
    else if (kind === 'transfer') setQuantity(item.quantity)
    else setQuantity(1)
  }, [open, kind, item, locations])

  if (!open || !kind || !item) return null
  const copy = STOCK_ACTION_COPY[kind]
  const activeLocations = locations.filter((location) => location.isActive && location.name !== item.location)

  return <ModalShell title={copy.title} subtitle={`${item.name} · ${item.sku}`} onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      onSubmit({
        quantity,
        reason: reason.trim(),
        operator: operator.trim() || '库存管理员',
        toLocation: kind === 'transfer' ? toLocation : undefined,
        relatedWorkOrder: kind === 'issue' ? relatedWorkOrder.trim() : undefined,
      })
    }}>
      <div className="modal-content">
        <p className="inventory-dialog-summary">
          当前数量 <strong>{item.quantity}</strong>{item.unit}
          · 预留 <strong>{item.reservedQuantity}</strong>
          · 可用 <strong>{availableQuantity(item)}</strong>
          · 库位 <strong>{item.location}</strong>
        </p>
        <label>{copy.quantityLabel}<b>*</b>
          <input required type="number" step={1} value={quantity}
            min={kind === 'adjust' ? undefined : 1}
            onChange={(event) => setQuantity(Number(event.target.value))} />
        </label>
        {kind === 'transfer' && <label>目标库位<b>*</b>
          <select required value={toLocation} onChange={(event) => setToLocation(event.target.value)}>
            {activeLocations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
          </select>
        </label>}
        {kind === 'issue' && <label>关联工单
          <input maxLength={40} placeholder="例如 WO-1042" value={relatedWorkOrder}
            onChange={(event) => setRelatedWorkOrder(event.target.value)} />
        </label>}
        <label>操作人
          <input maxLength={40} value={operator}
            onChange={(event) => setOperator(event.target.value)} />
        </label>
        <label>{copy.reasonLabel}<b>*</b>
          <textarea required rows={3} maxLength={300} value={reason}
            onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? '提交中…' : '确认'}</button>
      </footer>
    </form>
  </ModalShell>
}

export function InventoryBulkTransferDialog({
  open,
  count,
  locations,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  count: number
  locations: InventoryLocation[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: { toLocation: string; reason: string; operator: string }) => void
}) {
  const [toLocation, setToLocation] = useState('')
  const [reason, setReason] = useState('')
  const [operator, setOperator] = useState('库存管理员')
  const activeLocations = useMemo(() => locations.filter((location) => location.isActive), [locations])

  useEffect(() => {
    if (!open) return
    setToLocation(activeLocations[0]?.name ?? '')
    setReason('批量调拨')
    setOperator('库存管理员')
  }, [open, activeLocations])

  if (!open) return null

  return <ModalShell title="批量调拨" subtitle={`已选择 ${count} 项物资，将整批调拨到目标库位`} onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      onSubmit({
        toLocation,
        reason: reason.trim(),
        operator: operator.trim() || '库存管理员',
      })
    }}>
      <div className="modal-content">
        <label>目标库位<b>*</b>
          <select required value={toLocation} onChange={(event) => setToLocation(event.target.value)}>
            {activeLocations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
          </select>
        </label>
        <label>操作人
          <input maxLength={40} value={operator} onChange={(event) => setOperator(event.target.value)} />
        </label>
        <label>调拨原因<b>*</b>
          <textarea required rows={3} maxLength={300} value={reason}
            onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? '处理中…' : '确认调拨'}</button>
      </footer>
    </form>
  </ModalShell>
}

export function InventoryStartStocktakeDialog({
  open,
  locations,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  locations: InventoryLocation[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: { location: string; operator: string; notes: string }) => void
}) {
  const [location, setLocation] = useState('')
  const [operator, setOperator] = useState('库存管理员')
  const [notes, setNotes] = useState('')
  const activeLocations = useMemo(() => locations.filter((entry) => entry.isActive), [locations])

  useEffect(() => {
    if (!open) return
    setLocation(activeLocations[0]?.name ?? '')
    setOperator('库存管理员')
    setNotes('')
  }, [open, activeLocations])

  if (!open) return null

  return <ModalShell title="发起库位盘点" subtitle="按库位生成账面快照，录入实盘后过账调整" onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      onSubmit({ location, operator: operator.trim() || '库存管理员', notes: notes.trim() })
    }}>
      <div className="modal-content">
        <label>盘点库位<b>*</b>
          <select required value={location} onChange={(event) => setLocation(event.target.value)}>
            {activeLocations.map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}
          </select>
        </label>
        <label>盘点人
          <input maxLength={40} value={operator} onChange={(event) => setOperator(event.target.value)} />
        </label>
        <label>备注
          <textarea rows={3} maxLength={200} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? '创建中…' : '开始盘点'}</button>
      </footer>
    </form>
  </ModalShell>
}

export function InventoryScanDialog({
  open,
  busy,
  error,
  onClose,
  onResolve,
}: {
  open: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onResolve: (code: string, action: StockActionKind) => void
}) {
  const [code, setCode] = useState('')
  const [action, setAction] = useState<StockActionKind>('issue')

  useEffect(() => {
    if (!open) return
    setCode('')
    setAction('issue')
  }, [open])

  if (!open) return null

  return <ModalShell title="SKU / 条码扫码" subtitle="模拟扫枪录入，快速定位物资并执行出入库" onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      onResolve(code.trim(), action)
    }}>
      <div className="modal-content">
        <label>SKU / 物资编号 / 名称<b>*</b>
          <input
            data-overlay-initial-focus
            required
            autoComplete="off"
            placeholder="例如 HDST-ANC 或 主动降噪耳麦"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <label>执行动作<b>*</b>
          <select value={action} onChange={(event) => setAction(event.target.value as StockActionKind)}>
            <option value="issue">领用出库</option>
            <option value="receive">采购入库</option>
            <option value="transfer">库位调拨</option>
            <option value="reserve">预留占用</option>
            <option value="adjust">库存调整</option>
          </select>
        </label>
        <p className="inventory-dialog-summary">
          扫码是库存域特有交互：工单平台按流程流转，库存平台按实物编码快速作业。
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy || !code.trim()}>识别并继续</button>
      </footer>
    </form>
  </ModalShell>
}

export function InventoryQuickPickDialog({
  open,
  title,
  subtitle,
  items,
  confirmLabel,
  onClose,
  onPick,
}: {
  open: boolean
  title: string
  subtitle: string
  items: InventoryItem[]
  confirmLabel: string
  onClose: () => void
  onPick: (item: InventoryItem) => void
}) {
  const [itemId, setItemId] = useState('')
  const options = useMemo(
    () => [...items].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [items],
  )

  useEffect(() => {
    if (!open) return
    setItemId(options[0]?.id ?? '')
  }, [open, options])

  if (!open) return null
  const selected = options.find((item) => item.id === itemId) ?? null

  return <ModalShell title={title} subtitle={subtitle} onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      if (!selected) return
      onPick(selected)
    }}>
      <div className="modal-content">
        <label>选择物资<b>*</b>
          <select required value={itemId} onChange={(event) => setItemId(event.target.value)}>
            {options.map((item) => <option key={item.id} value={item.id}>
              {item.name} · {item.sku}（可用 {availableQuantity(item)}）
            </option>)}
          </select>
        </label>
        {selected && <p className="inventory-dialog-summary">
          库位 <strong>{selected.location}</strong>
          · 账面 <strong>{selected.quantity}</strong>{selected.unit}
          · 预留 <strong>{selected.reservedQuantity}</strong>
          · 可用 <strong>{availableQuantity(selected)}</strong>
        </p>}
      </div>
      <footer className="modal-footer">
        <button className="button button-quiet" type="button" onClick={onClose}>取消</button>
        <button className="button button-primary" type="submit" disabled={!selected}>{confirmLabel}</button>
      </footer>
    </form>
  </ModalShell>
}

export type { StockActionKind }
