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
        const result = await (anyTrpc.people.getOwnProfile.query() as Promise<{
          profile: EmployeeProfile
          employmentId: string
        }>)
        setProfile(result.profile)
        setEmploymentId(result.employmentId)
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
        <p className="text-sm text-[#8a8f98]">Your profile could not be loaded.</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto p-3 space-y-6">
      <div>
        <h1 className="text-2xl font-510 tracking-[-0.288px] text-[#f7f8f8]">My Profile</h1>
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
