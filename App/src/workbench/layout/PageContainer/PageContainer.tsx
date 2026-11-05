import type { PageContainerProps } from './PageContainer.types'

export function PageContainer({ title, description, eyebrow, breadcrumbs, actions, children, maxWidth = 'wide', className = '' }: PageContainerProps) {
  return <section className={`wb-page-container wb-page-${maxWidth}${className ? ` ${className}` : ''}`}>
    {breadcrumbs && <div className="wb-page-breadcrumbs">{breadcrumbs}</div>}
    {(title || description || eyebrow || actions) && <header className="wb-page-header">
      <div className="wb-page-heading">
        {eyebrow && <span className="wb-page-eyebrow">{eyebrow}</span>}
        {title && <h1>{title}</h1>}
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="wb-page-actions">{actions}</div>}
    </header>}
    <div className="wb-page-content">{children}</div>
  </section>
}
