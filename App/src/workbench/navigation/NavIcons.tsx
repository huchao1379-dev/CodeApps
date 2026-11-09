import type { ReactNode, SVGProps } from 'react'

function Icon(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props
  return <svg viewBox="0 0 20 20" width="1em" height="1em" fill="none" aria-hidden="true" {...rest}>
    {children}
  </svg>
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const NavIconOverview = () => <Icon>
  <path d="M3.5 8.2 10 3l6.5 5.2V16a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V8.2Z" {...stroke} />
  <path d="M8 17v-5h4v5" {...stroke} />
</Icon>

export const NavIconWorkOrders = () => <Icon>
  <rect x="3.5" y="3.5" width="13" height="13" rx="2" {...stroke} />
  <path d="M7 8h6M7 12h4" {...stroke} />
</Icon>

export const NavIconDispatch = () => <Icon>
  <path d="M4 10h10.5M11 6.5 14.5 10 11 13.5" {...stroke} />
  <path d="M4 6.5v7" {...stroke} />
</Icon>

export const NavIconApprovals = () => <Icon>
  <path d="M5 10.5 8.2 13.7 15 6.5" {...stroke} />
  <rect x="3.5" y="3.5" width="13" height="13" rx="2" {...stroke} />
</Icon>

export const NavIconResources = () => <Icon>
  <circle cx="10" cy="7" r="2.6" {...stroke} />
  <path d="M4.5 16c.8-2.6 2.8-4 5.5-4s4.7 1.4 5.5 4" {...stroke} />
  <circle cx="15.2" cy="8.2" r="1.6" {...stroke} />
</Icon>
