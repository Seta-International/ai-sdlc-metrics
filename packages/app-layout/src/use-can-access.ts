'use client'

import { useContext } from 'react'
import { PermissionContext } from './permission-provider'

export function useCanAccess(permissionKey?: string): boolean {
  const { permissions, isLoading } = useContext(PermissionContext)

  if (permissionKey === undefined) return true
  if (isLoading) return false
  return permissions.has(permissionKey)
}
