'use client'

import { createContext, useState, useEffect, type ReactNode } from 'react'
import type { TRPCClient } from '@future/api-client'

export interface PermissionContextValue {
  permissions: Set<string>
  roles: string[]
  isLoading: boolean
}

export const PermissionContext = createContext<PermissionContextValue>({
  permissions: new Set(),
  roles: [],
  isLoading: true,
})

export interface PermissionProviderProps {
  trpc: TRPCClient
  children: ReactNode
}

export function PermissionProvider({ trpc, children }: PermissionProviderProps) {
  const [state, setState] = useState<PermissionContextValue>({
    permissions: new Set(),
    roles: [],
    isLoading: true,
  })

  useEffect(() => {
    let cancelled = false

    trpc.kernel.getMyPermissions
      .query()
      .then((permissions: string[]) => {
        if (!cancelled) {
          setState({
            permissions: new Set(permissions),
            roles: [],
            isLoading: false,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ permissions: new Set(), roles: [], isLoading: false })
        }
      })

    return () => {
      cancelled = true
    }
  }, [trpc])

  return <PermissionContext.Provider value={state}>{children}</PermissionContext.Provider>
}
