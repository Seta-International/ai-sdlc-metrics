'use client'

import { createContext } from 'react'

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
