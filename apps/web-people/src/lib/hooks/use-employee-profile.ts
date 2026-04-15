import * as React from 'react'
import { trpc } from '../trpc'
import type { EmployeeProfile } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type ProfilePermissions = {
  canEdit: boolean
  canManage: boolean
  isSelf: boolean
  canEditPersonal: boolean
  canEditEmployment: boolean
  canEditBank: boolean
  canUploadDocuments: boolean
  canCreateContract: boolean
  canViewSalary: boolean
  canApproveChanges: boolean
  canManageProbation: boolean
}

const defaultPermissions: ProfilePermissions = {
  canEdit: false,
  canManage: false,
  isSelf: false,
  canEditPersonal: false,
  canEditEmployment: false,
  canEditBank: false,
  canUploadDocuments: false,
  canCreateContract: false,
  canViewSalary: false,
  canApproveChanges: false,
  canManageProbation: false,
}

type UseEmployeeProfileReturn = {
  profile: EmployeeProfile | null
  permissions: ProfilePermissions
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useEmployeeProfile(employmentId: string): UseEmployeeProfileReturn {
  const [profile, setProfile] = React.useState<EmployeeProfile | null>(null)
  const [permissions, setPermissions] = React.useState<ProfilePermissions>(defaultPermissions)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refetchKey, setRefetchKey] = React.useState(0)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await (anyTrpc.people.profile.get.query({
          employmentId,
        }) as Promise<{ profile: EmployeeProfile; permissions: ProfilePermissions }>)
        setProfile(result.profile)
        setPermissions(result.permissions)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId, refetchKey])

  return {
    profile,
    permissions,
    isLoading,
    error,
    refetch: () => setRefetchKey((k) => k + 1),
  }
}
