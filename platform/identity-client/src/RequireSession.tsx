import type { ReactNode } from 'react'
import { useMe } from './useMe'

export type RequireSessionProps = {
  children: ReactNode
  fallback?: ReactNode
}

export function RequireSession({ children, fallback = null }: RequireSessionProps) {
  const { data, isLoading, error } = useMe()

  if (isLoading) return <>{fallback}</>

  if (error || !data) {
    if (typeof window !== 'undefined') {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/console/login?returnTo=${returnTo}`
    }
    return <>{fallback}</>
  }

  return <>{children}</>
}
