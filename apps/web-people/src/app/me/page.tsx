'use client'

import * as React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Skeleton } from '@future/ui'
import { ProfileHeader } from '../../components/profile/profile-header'
import { ProfileTabs } from '../../components/profile/profile-tabs'
import type { EmployeeProfile } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

/**
 * The API returns raw entities (`{ profile, employments[] }`) while the UI
 * expects a denormalized view model (`EmployeeProfile`). Map at the edge so
 * components downstream don't have to second-guess shape. Anything not yet
 * sourced from the API gets a safe default — the UI is null-tolerant for
 * those fields.
 */
function toEmployeeProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
): EmployeeProfile | null {
  if (!raw?.profile) return null
  const employment = raw.employments?.[0]?.employment
  if (!employment) return null
  return {
    personProfile: {
      id: raw.profile.id,
      actorId: raw.profile.actorId,
      familyName: raw.profile.familyName ?? '',
      givenName: raw.profile.givenName ?? '',
      middleName: raw.profile.middleName ?? null,
      fullName: raw.profile.fullName ?? '',
      preferredName: raw.profile.preferredName ?? null,
      nameDisplayOrder: raw.profile.nameDisplayOrder ?? 'given_first',
      dateOfBirth: raw.profile.dateOfBirth ?? null,
      gender: raw.profile.gender ?? null,
      nationality: raw.profile.nationality ?? null,
      maritalStatus: raw.profile.maritalStatus ?? null,
      photoUrl: null,
    },
    employment: {
      id: employment.id,
      employeeCode: employment.employeeCode ?? null,
      companyEmail: employment.companyEmail ?? null,
      workerType: employment.workerType,
      employmentType: employment.employmentType,
      countryCode: employment.countryCode ?? '',
      employmentStatus: employment.employmentStatus,
      hireDate: employment.hireDate,
      terminationDate: employment.terminationDate ?? null,
      terminationReason: employment.terminationReason ?? null,
      workArrangement: null,
    },
    currentJob: null,
    emergencyContacts: [],
    addresses: [],
    countryFields: [],
    customFields: [],
    bankDetails: null,
    probation: null,
    completenessScore: 0,
    completenessMissing: [],
  }
}

export default function MyProfilePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') ?? 'overview'

  const [profile, setProfile] = React.useState<EmployeeProfile | null>(null)
  const [employmentId, setEmploymentId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.getOwnProfile.query()
        const mapped = toEmployeeProfile(result)
        if (!mapped) {
          setProfile(null)
          setEmploymentId(null)
          return
        }
        setProfile(mapped)
        setEmploymentId(mapped.employment.id)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  function handleTabChange(tab: string) {
    const p = new URLSearchParams(window.location.search)
    p.set('tab', tab)
    router.replace(`${window.location.pathname}?${p.toString()}`)
  }

  if (isLoading) {
    return (
      <main className="container mx-auto p-3 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </main>
    )
  }

  if (!profile || !employmentId) {
    return (
      <main className="container mx-auto py-8">
        <p className="text-sm text-fg-muted">Your profile could not be loaded.</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">My Profile</h1>
      </div>

      <ProfileHeader
        profile={profile}
        canEdit={true}
        canManage={false}
        isSelf={true}
        onEdit={() => {}}
        onShare={() => {}}
      />

      <ProfileTabs
        profile={profile}
        employmentId={employmentId}
        canEditPersonal={true}
        canEditEmployment={false}
        canEditBank={false}
        canUploadDocuments={true}
        canCreateContract={false}
        canViewSalary={true}
        canApproveChanges={false}
        canManageProbation={false}
        isSelf={true}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </main>
  )
}
