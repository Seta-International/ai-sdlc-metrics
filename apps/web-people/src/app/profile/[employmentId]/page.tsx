'use client'

import * as React from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Skeleton } from '@future/ui'
import { ProfileHeader } from '../../../components/profile/ProfileHeader'
import { ProfileTabs } from '../../../components/profile/ProfileTabs'
import type { EmployeeProfile } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEmployeeProfile(raw: any): EmployeeProfile | null {
  if (!raw?.employment || !raw?.personProfile) return null

  const detail = raw.detail
  const employment = raw.employment
  const personProfile = raw.personProfile

  return {
    personProfile: {
      id: personProfile.id,
      actorId: personProfile.actorId,
      familyName: personProfile.familyName ?? '',
      givenName: personProfile.givenName ?? '',
      middleName: personProfile.middleName ?? null,
      fullName: personProfile.fullName ?? '',
      preferredName: personProfile.preferredName ?? null,
      nameDisplayOrder: personProfile.nameDisplayOrder ?? 'given_first',
      dateOfBirth: personProfile.dateOfBirth ?? null,
      gender: personProfile.gender ?? null,
      nationality: personProfile.nationality ?? null,
      maritalStatus: personProfile.maritalStatus ?? null,
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
      workArrangement: raw.currentAssignment?.workArrangement ?? null,
    },
    currentJob: null,
    emergencyContacts: Array.isArray(detail?.emergencyContacts)
      ? detail.emergencyContacts.map((contact: Record<string, unknown>, index: number) => ({
          id: String(contact['id'] ?? `ec-${index}`),
          name: String(contact['name'] ?? ''),
          relationship: String(contact['relationship'] ?? ''),
          phone: String(contact['phone'] ?? ''),
          email: contact['email'] == null ? null : String(contact['email']),
        }))
      : [],
    addresses: [],
    countryFields: [],
    customFields: [],
    bankDetails:
      detail?.bankAccountNumber ||
      detail?.bankName ||
      detail?.bankAccountHolder ||
      detail?.bankSwiftCode
        ? {
            accountNumber: detail.bankAccountNumber ?? '',
            bankName: detail.bankName ?? null,
            branchName: detail.bankBranch ?? null,
            holderName: detail.bankAccountHolder ?? null,
            swiftCode: detail.bankSwiftCode ?? null,
          }
        : null,
    probation: null,
    completenessScore: 0,
    completenessMissing: [],
  }
}

export default function EmployeeProfilePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const employmentId = params.employmentId as string
  const activeTab = searchParams.get('tab') ?? 'overview'

  const [profile, setProfile] = React.useState<EmployeeProfile | null>(null)
  const [permissions, setPermissions] = React.useState<ProfilePermissions>(defaultPermissions)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.getEmployment.query({
          employmentId,
        })
        setProfile(toEmployeeProfile(result))
        setPermissions(defaultPermissions)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

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

  if (!profile) {
    return (
      <main className="container mx-auto py-8">
        <p className="text-sm text-fg-muted">Employee not found.</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto p-3 space-y-6">
      <ProfileHeader
        profile={profile}
        canEdit={permissions.canEdit}
        canManage={permissions.canManage}
        isSelf={permissions.isSelf}
        onEdit={() => {}}
        onShare={() => {}}
        onStartOffboarding={permissions.canManage ? () => {} : undefined}
      />

      <ProfileTabs
        profile={profile}
        employmentId={employmentId}
        canEditPersonal={permissions.canEditPersonal}
        canEditEmployment={permissions.canEditEmployment}
        canEditBank={permissions.canEditBank}
        canUploadDocuments={permissions.canUploadDocuments}
        canCreateContract={permissions.canCreateContract}
        canViewSalary={permissions.canViewSalary}
        canApproveChanges={permissions.canApproveChanges}
        canManageProbation={permissions.canManageProbation}
        isSelf={permissions.isSelf}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </main>
  )
}
