import { useEffect, useState } from 'react'
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../../../shared/components'
import { sharePointWorkOrderMaterialsRepository } from '../../../data-access/sharepoint/sharePointWorkOrderMaterialsRepository'
import type { WorkOrderMaterial } from '../../../data-access/contracts/workOrderMaterialsRepository'
import './RelatedMaterialsPanel.css'

function formatModifiedAt(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function RelatedMaterialsPanel({
  workOrderNumber,
  serviceCategory,
}: {
  workOrderNumber: string
  serviceCategory?: string | null
}) {
  const [materials, setMaterials] = useState<WorkOrderMaterial[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const normalizedNumber = workOrderNumber.trim()

  useEffect(() => {
    if (!normalizedNumber) {
      setMaterials([])
      setLoading(false)
      setError(null)
      return undefined
    }
    let active = true
    setLoading(true)
    setError(null)
    sharePointWorkOrderMaterialsRepository.listByWorkOrderNumber(normalizedNumber)
      .then((rows) => {
        if (!active) return
        const preferred = serviceCategory?.trim()
        const sorted = preferred
          ? [...rows].sort((left, right) => {
            const leftMatch = left.serviceCategory === preferred ? 0 : 1
            const rightMatch = right.serviceCategory === preferred ? 0 : 1
            return leftMatch - rightMatch
          })
          : rows
        setMaterials(sorted)
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '读取 SharePoint 资料失败。')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [normalizedNumber, serviceCategory, refreshToken])

  return <section className="detail-section related-materials" aria-labelledby="related-materials-title">
    <div className="section-heading">
      <h3 id="related-materials-title">相关资料</h3>
      <span>SHAREPOINT · {normalizedNumber || '未编号'}</span>
    </div>

    {!normalizedNumber && <EmptyState
      title="工单编号尚未生成"
      description="生成工单编号后，将按编号从 SharePoint 文档库 WorkOrderMaterials 读取关联资料。"
      icon="S"
    />}

    {normalizedNumber && loading && <LoadingState label="正在读取 SharePoint 相关资料…" size="small" />}

    {normalizedNumber && !loading && error && <ErrorState
      title="SharePoint 资料读取失败"
      description={error}
      onRetry={() => setRefreshToken((value) => value + 1)}
    />}

    {normalizedNumber && !loading && !error && materials.length === 0 && <EmptyState
      title="暂无关联资料"
      description={`文档库中还没有工单编号为 ${normalizedNumber} 的文件。请在 SharePoint WorkOrderMaterials 中为文件填写相同的「工单编号」列。`}
      icon="S"
    />}

    {normalizedNumber && !loading && !error && materials.length > 0 && <ul className="related-materials-list">
      {materials.map((material) => <li key={material.id} className="related-materials-item">
        <div className="related-materials-main">
          <strong>{material.title}</strong>
          <p>{material.fileName}</p>
          <div className="related-materials-meta">
            {material.materialType && <StatusBadge status={material.materialType} label={material.materialType} size="small" />}
            {material.serviceCategory && <span>{material.serviceCategory}</span>}
            <span>{formatModifiedAt(material.modifiedAt)}</span>
            {material.authorName && <span>{material.authorName}</span>}
          </div>
        </div>
        {material.webUrl
          ? <a className="button button-quiet related-materials-open" href={material.webUrl} target="_blank" rel="noreferrer">打开</a>
          : <span className="related-materials-unavailable">无链接</span>}
      </li>)}
    </ul>}
  </section>
}
