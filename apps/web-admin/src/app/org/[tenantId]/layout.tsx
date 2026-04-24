import type { ReactNode } from 'react'

interface OrgLayoutProps {
  children: ReactNode
  params: { tenantId: string }
}

/**
 * Org context layout — wraps all /org/[tenantId]/... pages.
 *
 * The layout intentionally stays minimal: it does not mutate the session cookie
 * or intercept navigation. Platform admins pass tenantId explicitly to
 * platform-safe procedures. The OrgContextSwitcher banner is rendered at the
 * page level where tenantId is resolved.
 */
export default function OrgLayout({ children }: OrgLayoutProps) {
  return <>{children}</>
}
