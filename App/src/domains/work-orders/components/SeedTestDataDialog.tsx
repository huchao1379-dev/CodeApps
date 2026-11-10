import { useOverlayFocus } from '../../../shared/components'
import type { TestDataSeedPhase } from '../services/dataverseTestDataSeeder'

export interface SeedTestDataDialogProps {
  open: boolean
  busy: boolean
  seedPhase: TestDataSeedPhase | null
  onClose: () => void
  onConfirm: () => void
}

export function SeedTestDataDialog({
  open,
  busy,
  seedPhase,
  onClose,
  onConfirm,
}: SeedTestDataDialogProps) {
  const seedDialogRef = useOverlayFocus<HTMLElement>(open, () => { if (!busy) onClose() })
  if (!open) return null

  return <div className="modal-backdrop" role="presentation">
    <section
      ref={seedDialogRef}
      tabIndex={-1}
      className="modal-card seed-dataset-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="seed-data-title"
      aria-describedby="seed-data-description"
    >
      <header className="modal-header">
        <div>
          <h2 id="seed-data-title">写入 IT 服务演练数据</h2>
          <p>数据将写入当前连接的真实 Dataverse 环境</p>
        </div>
        <button data-overlay-initial-focus className="icon-button" type="button" aria-label="关闭" disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="modal-content seed-dataset-content">
        <p id="seed-data-description">用于测试派单、负载筛选、批量操作、SLA 逾期和运营分析。所有新建资源与工单均带有 <strong>[IT演练]</strong> 标记。</p>
        <dl className="seed-dataset-counts">
          <div><dt>部门</dt><dd>3</dd></div><div><dt>员工</dt><dd>8</dd></div><div><dt>服务类别</dt><dd>8</dd></div>
          <div><dt>工单</dt><dd>30</dd></div><div><dt>派发记录</dt><dd>18</dd></div><div><dt>历史记录</dt><dd>50</dd></div>
        </dl>
        <p>工单覆盖全部七种状态、四档优先级、逾期与未逾期 SLA；员工样例包含不可接单、负载容量和停用记录。</p>
        <p className="seed-dataset-warning">写入前会检查已存在的演练标记并跳过，不覆盖已有记录；部分写入失败时已成功创建的数据会保留，重新执行可继续补齐。应用不会自动删除这些真实记录。</p>
        {seedPhase && <p className="seed-dataset-progress" role="status">
          {seedPhase === 'checking' ? '正在读取并核对现有 Dataverse 记录…'
            : seedPhase === 'resources' ? '正在写入演练部门、员工和服务类别…'
              : seedPhase === 'work-orders' ? '正在写入 IT 服务工单…' : '正在补充派发记录和工单历史…'}
        </p>}
      </div>
      <footer className="modal-footer seed-dataset-actions">
        <button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="button button-primary" type="button" disabled={busy} onClick={onConfirm}>{busy ? '正在写入…' : '确认写入演练数据'}</button>
      </footer>
    </section>
  </div>
}
