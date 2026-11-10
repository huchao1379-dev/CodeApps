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

export const NavIconInventory = () => <Icon>
  <path d="M4 7.2 10 4l6 3.2v8.3L10 18.5 4 15.5V7.2Z" {...stroke} />
  <path d="M10 10.2V18.5M4 7.2 10 10.2 16 7.2" {...stroke} />
</Icon>

export const NavIconAlerts = () => <Icon>
  <path d="M10 3.5 16.5 15.5H3.5L10 3.5Z" {...stroke} />
  <path d="M10 8.2v3.2M10 13.5h.01" {...stroke} />
</Icon>

export const NavIconStocktake = () => <Icon>
  <rect x="4" y="3.5" width="12" height="13" rx="1.5" {...stroke} />
  <path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" {...stroke} />
</Icon>

export const NavIconReplenish = () => <Icon>
  <path d="M4 13.5h8.5l2.5-5H7.2L4 13.5Z" {...stroke} />
  <path d="M7.5 8.5V4.5M7.5 4.5 5.8 6.2M7.5 4.5 9.2 6.2" {...stroke} />
</Icon>

export const NavIconBatches = () => <Icon>
  <rect x="3.5" y="5" width="5.5" height="10" rx="1" {...stroke} />
  <rect x="11" y="5" width="5.5" height="10" rx="1" {...stroke} />
  <path d="M5.2 8h2.2M5.2 11h2.2M12.7 8h2.2M12.7 11h2.2" {...stroke} />
</Icon>

export const NavIconAccess = () => <Icon>
  <circle cx="10" cy="8" r="3" {...stroke} />
  <path d="M4.5 16.2c.9-2.8 3-4.2 5.5-4.2s4.6 1.4 5.5 4.2" {...stroke} />
  <path d="M14.2 4.8 16 6.6 14.2 8.4" {...stroke} />
</Icon>
