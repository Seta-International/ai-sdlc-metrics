'use client'

import * as React from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { Skeleton, Tabs, TabsContent } from '@future/ui'
import { EditProfileBar } from './EditProfileBar'
import { ProfileHero } from './hero/ProfileHero'
import { TabOverview } from './tabs/TabOverview'
import { TabJobHistory } from './tabs/TabJobHistory'
import { TabDocuments } from './tabs/TabDocuments'
import { TabCompensation } from './tabs/TabCompensation'
import { TabChangeRequests } from './tabs/TabChangeRequests'
import { TabActivity } from './tabs/TabActivity'
import type { EmployeeProfile } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export type ProfilePermissions = {
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEmployeeProfile(raw: any): EmployeeProfile | null {
  if (!raw?.employment || !raw?.personProfile) return null
  const { currentAssignment, detail, employment, personProfile, stagedMsUser } = raw
  const resolvedJobTitle = detail?.msJobTitle ?? stagedMsUser?.jobTitle ?? null
  const resolvedDepartment = detail?.msDepartment ?? stagedMsUser?.department ?? null
  const currentJob =
    resolvedJobTitle || resolvedDepartment || currentAssignment
      ? {
          id: String(currentAssignment?.id ?? `ms-job-${employment.id}`),
          jobProfileId: String(currentAssignment?.jobProfileId ?? 'default'),
          jobTitle: resolvedJobTitle ? String(resolvedJobTitle) : '—',
          jobLevel: null,
          jobFamilyName: '',
          departmentId: String(currentAssignment?.departmentId ?? ''),
          departmentName: resolvedDepartment ? String(resolvedDepartment) : '—',
          locationId: currentAssignment?.locationId ?? null,
          locationName: detail?.officeLocation ?? null,
          costCenter: currentAssignment?.costCenterId ?? null,
          managerId: currentAssignment?.managerId ?? null,
          managerName: null,
          effectiveDate: String(currentAssignment?.effectiveFrom ?? employment.hireDate),
        }
      : null

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
      workArrangement: currentAssignment?.workArrangement ?? null,
    },
    currentJob,
    personalEmail: detail?.personalEmail ?? null,
    personalPhone: detail?.personalPhone ?? null,
    officeLocation: detail?.officeLocation ?? null,
    workPhone: detail?.workPhone ?? null,
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

interface ProfilePageProps {
  employmentId: string
}

export function ProfilePage({ employmentId }: ProfilePageProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const activeTab = searchParams.get('tab') ?? 'overview'

  const [profile, setProfile] = React.useState<EmployeeProfile | null>(null)
  const [permissions, setPermissions] = React.useState<ProfilePermissions>(defaultPermissions)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isEditing, setIsEditing] = React.useState(false)
  const [dirtyFields, setDirtyFields] = React.useState(
    new Map<string, { old: unknown; new: unknown }>(),
  )
  const [editReason, setEditReason] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const fetchProfile = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const [result, perms] = await Promise.all([
        anyTrpc.people.getEmployment.query({ employmentId }),
        anyTrpc.people.getProfilePermissions.query({ employmentId }),
      ])
      setProfile(toEmployeeProfile(result))
      setPermissions(perms ?? defaultPermissions)
    } finally {
      setIsLoading(false)
    }
  }, [employmentId])

  React.useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  function handleFieldChange(fieldPath: string, oldValue: unknown, newValue: unknown) {
    setDirtyFields((prev) => {
      const next = new Map(prev)
      next.set(fieldPath, { old: oldValue, new: newValue })
      return next
    })
  }

  function handleCancelEdit() {
    setIsEditing(false)
    setDirtyFields(new Map())
  }

  async function handleSubmitChanges() {
    if (dirtyFields.size === 0) return
    setIsSubmitting(true)
    try {
      const changes = Array.from(dirtyFields.entries()).map(
        ([fieldPath, { old: oldValue, new: newValue }]) => ({ fieldPath, oldValue, newValue }),
      )
      await anyTrpc.people.requestProfileChanges.mutate({
        employmentId,
        changes,
        reason: editReason.trim() || undefined,
      })
      setIsEditing(false)
      setDirtyFields(new Map())
      setEditReason('')
      void fetchProfile()
    } catch {
      // tRPC errors surface via the global error boundary
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleTabChange(tab: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('tab', tab)
    router.replace(`${pathname}?${p.toString()}`)
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
    <main className="container mx-auto">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <ProfileHero
          profile={profile}
          permissions={permissions}
          isEditing={isEditing}
          onEdit={() => setIsEditing(true)}
          onDoneEditing={handleCancelEdit}
          onShare={() => {}}
          onStartOffboarding={permissions.canManage ? () => {} : undefined}
        />
        <TabsContent value="overview">
          <TabOverview
            profile={profile}
            employmentId={employmentId}
            canEditPersonal={permissions.canEditPersonal}
            canEditBank={permissions.canEditBank}
            canViewSalary={permissions.canViewSalary}
            isEditing={isEditing}
            dirtyFields={dirtyFields}
            onFieldChange={handleFieldChange}
            onSaved={() => {
              void fetchProfile()
            }}
          />
        </TabsContent>
        <TabsContent value="job-history">
          <TabJobHistory
            profileId={profile.personProfile.id}
            canEdit={permissions.canEdit}
            hireDate={profile.employment.hireDate}
          />
        </TabsContent>
        <TabsContent value="documents">
          <TabDocuments employmentId={employmentId} canUpload={permissions.canUploadDocuments} />
        </TabsContent>
        <TabsContent value="compensation">
          <TabCompensation
            employmentId={employmentId}
            canViewSalary={permissions.canViewSalary}
            canCreateContract={permissions.canCreateContract}
            canEdit={permissions.canEdit}
          />
        </TabsContent>
        <TabsContent value="changes">
          <TabChangeRequests
            employmentId={employmentId}
            canApprove={permissions.canApproveChanges}
          />
        </TabsContent>
        <TabsContent value="activity">
          <TabActivity employmentId={employmentId} />
        </TabsContent>
      </Tabs>
      {isEditing && (
        <EditProfileBar
          dirtyCount={dirtyFields.size}
          reason={editReason}
          onReasonChange={setEditReason}
          onCancel={handleCancelEdit}
          onSubmit={() => {
            void handleSubmitChanges()
          }}
          isSubmitting={isSubmitting}
        />
      )}
    </main>
  )
}
