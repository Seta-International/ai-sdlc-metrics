# Member Details Redesign — Plan 01: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the profile directory — add new types, create `ProfilePage.tsx`, slim down `page.tsx` to a thin shell, create the barrel `index.ts`, and delete obsolete files.

**Architecture:** `ProfilePage.tsx` absorbs the state and data-fetching logic previously scattered across `page.tsx`, `ProfileHeader`, and `ProfileTabs`. `page.tsx` becomes a one-liner wrapper. All old profile files that the redesign replaces are deleted now so the compiler catches stale references immediately.

**Tech Stack:** Next.js 14 app router, React, TypeScript, tRPC (`trpc as any` pattern), Vitest + @testing-library/react

---

## Files

| Action | Path                                                            |
| ------ | --------------------------------------------------------------- |
| Modify | `apps/web-people/src/lib/types.ts`                              |
| Create | `apps/web-people/src/components/profile/ProfilePage.tsx`        |
| Create | `apps/web-people/src/components/profile/index.ts`               |
| Modify | `apps/web-people/src/app/profile/[employmentId]/page.tsx`       |
| Modify | `apps/web-people/src/app/profile/[employmentId]/page.spec.tsx`  |
| Delete | `apps/web-people/src/components/profile/ProfileHeader.tsx`      |
| Delete | `apps/web-people/src/components/profile/ProfileHeader.spec.tsx` |
| Delete | `apps/web-people/src/components/profile/ProfileTabs.tsx`        |
| Delete | `apps/web-people/src/components/profile/InfoCard.tsx`           |
| Delete | `apps/web-people/src/components/profile/TabContracts.tsx`       |
| Delete | `apps/web-people/src/components/profile/TabSections.tsx`        |
| Delete | `apps/web-people/src/components/profile/TabProbation.tsx`       |

---

### Task 1: Add new types to types.ts

**Files:**

- Modify: `apps/web-people/src/lib/types.ts`

- [ ] **Step 1: Append new types at the end of `apps/web-people/src/lib/types.ts`**

Add after the last export in the file:

```ts
// --- Profile redesign types ---

export type DirectReport = {
  employmentId: string
  fullName: string
  jobTitle: string | null
  avatarUrl: string | null
}

export type ActivityEvent = {
  id: string
  eventType: string
  description: string
  actorName: string
  occurredAt: string
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd apps/web-people && bun run typecheck
```

Expected: no errors related to the new types.

- [ ] **Step 3: Commit**

```bash
git add apps/web-people/src/lib/types.ts
git commit -m "feat(web-people): add DirectReport and ActivityEvent types"
```

---

### Task 2: Delete obsolete profile files

**Files:**

- Delete: `ProfileHeader.tsx`, `ProfileHeader.spec.tsx`, `ProfileTabs.tsx`, `InfoCard.tsx`, `TabContracts.tsx`, `TabSections.tsx`, `TabProbation.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm apps/web-people/src/components/profile/ProfileHeader.tsx
rm apps/web-people/src/components/profile/ProfileHeader.spec.tsx
rm apps/web-people/src/components/profile/ProfileTabs.tsx
rm apps/web-people/src/components/profile/InfoCard.tsx
rm apps/web-people/src/components/profile/TabContracts.tsx
rm apps/web-people/src/components/profile/TabSections.tsx
rm apps/web-people/src/components/profile/TabProbation.tsx
```

- [ ] **Step 2: Verify nothing else imports them**

```bash
grep -r "ProfileHeader\|ProfileTabs\|InfoCard\|TabContracts\|TabSections\|TabProbation" apps/web-people/src --include="*.ts" --include="*.tsx" -l
```

Expected: only `page.tsx` and `page.spec.tsx` reference `ProfileHeader`/`ProfileTabs`. Fix any other files found.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(web-people): delete obsolete profile components"
```

---

### Task 3: Create ProfilePage.tsx

**Files:**

- Create: `apps/web-people/src/components/profile/ProfilePage.tsx`

- [ ] **Step 1: Write the failing test first**

Create `apps/web-people/src/components/profile/ProfilePage.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { ProfilePage } from './ProfilePage'

const { mockGetEmployment } = vi.hoisted(() => ({
  mockGetEmployment: vi.fn().mockResolvedValue({
    employment: null,
    personProfile: null,
    currentAssignment: null,
    detail: null,
    sections: [],
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/profile/emp-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('../../lib/trpc', () => ({
  trpc: { people: { getEmployment: { query: mockGetEmployment } } },
}))

vi.mock('./hero/ProfileHero', () => ({ ProfileHero: () => <div data-testid="hero" /> }))
vi.mock('./tabs/TabOverview', () => ({ TabOverview: () => null }))
vi.mock('./tabs/TabJobHistory', () => ({ TabJobHistory: () => null }))
vi.mock('./tabs/TabDocuments', () => ({ TabDocuments: () => null }))
vi.mock('./tabs/TabCompensation', () => ({ TabCompensation: () => null }))
vi.mock('./tabs/TabChangeRequests', () => ({ TabChangeRequests: () => null }))
vi.mock('./tabs/TabActivity', () => ({ TabActivity: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProfilePage', () => {
  it('calls people.getEmployment with the given employmentId', async () => {
    render(<ProfilePage employmentId="emp-123" />)
    await waitFor(() => expect(mockGetEmployment).toHaveBeenCalledWith({ employmentId: 'emp-123' }))
  })

  it('renders the hero when profile loaded', async () => {
    mockGetEmployment.mockResolvedValueOnce({
      employment: {
        id: 'emp-1',
        employeeCode: 'E-001',
        companyEmail: 'alice@co.com',
        workerType: 'employee',
        employmentType: 'permanent',
        countryCode: 'SG',
        employmentStatus: 'active',
        hireDate: '2023-01-01',
        terminationDate: null,
        terminationReason: null,
        workArrangement: null,
      },
      personProfile: {
        id: 'pp-1',
        actorId: 'actor-1',
        familyName: 'Johnson',
        givenName: 'Alice',
        middleName: null,
        fullName: 'Alice Johnson',
        preferredName: null,
        nameDisplayOrder: 'given_first',
        dateOfBirth: null,
        gender: null,
        nationality: null,
        maritalStatus: null,
      },
      currentAssignment: null,
      detail: null,
      sections: [],
    })
    const { getByTestId } = render(<ProfilePage employmentId="emp-1" />)
    await waitFor(() => expect(getByTestId('hero')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run the test — expect FAIL (ProfilePage not found)**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "ProfilePage"
```

Expected: FAIL with "Cannot find module './ProfilePage'".

- [ ] **Step 3: Create ProfilePage.tsx**

Create `apps/web-people/src/components/profile/ProfilePage.tsx`:

```tsx
'use client'

import * as React from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { Skeleton, Tabs, TabsContent } from '@future/ui'
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
  const { detail, employment, personProfile } = raw
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

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.getEmployment.query({ employmentId })
        setProfile(toEmployeeProfile(result))
        setPermissions(defaultPermissions)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

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
          onEdit={() => {}}
          onShare={() => {}}
          onStartOffboarding={permissions.canManage ? () => {} : undefined}
        />
        <TabsContent value="overview">
          <TabOverview
            profile={profile}
            canEditPersonal={permissions.canEditPersonal}
            canViewSalary={permissions.canViewSalary}
          />
        </TabsContent>
        <TabsContent value="job-history">
          <TabJobHistory profileId={profile.personProfile.id} canEdit={permissions.canEdit} />
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
    </main>
  )
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "ProfilePage"
```

Expected: all ProfilePage tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/profile/ProfilePage.tsx \
        apps/web-people/src/components/profile/ProfilePage.spec.tsx
git commit -m "feat(web-people): add ProfilePage component with tab state and data fetch"
```

---

### Task 4: Create barrel index.ts and slim down page.tsx

**Files:**

- Create: `apps/web-people/src/components/profile/index.ts`
- Modify: `apps/web-people/src/app/profile/[employmentId]/page.tsx`
- Modify: `apps/web-people/src/app/profile/[employmentId]/page.spec.tsx`

- [ ] **Step 1: Create the barrel**

Create `apps/web-people/src/components/profile/index.ts`:

```ts
export { ProfilePage } from './ProfilePage'
export type { ProfilePermissions } from './ProfilePage'
```

- [ ] **Step 2: Replace page.tsx with a thin shell**

Replace the entire contents of `apps/web-people/src/app/profile/[employmentId]/page.tsx` with:

```tsx
'use client'

import { useParams } from 'next/navigation'
import { ProfilePage } from '../../../components/profile'

export default function EmployeeProfilePage() {
  const params = useParams()
  return <ProfilePage employmentId={params.employmentId as string} />
}
```

- [ ] **Step 3: Update page.spec.tsx**

Replace the entire contents of `apps/web-people/src/app/profile/[employmentId]/page.spec.tsx` with:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import EmployeeProfilePage from './page'

vi.mock('next/navigation', () => ({
  useParams: () => ({ employmentId: 'emp-abc' }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/profile/emp-abc',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: { getEmployment: { query: vi.fn().mockResolvedValue(null) } },
  },
}))

vi.mock('../../../components/profile', () => ({
  ProfilePage: ({ employmentId }: { employmentId: string }) => (
    <div data-testid="profile-page">{employmentId}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EmployeeProfilePage', () => {
  it('renders ProfilePage with the employmentId from route params', () => {
    const { getByTestId } = render(<EmployeeProfilePage />)
    expect(getByTestId('profile-page').textContent).toBe('emp-abc')
  })
})
```

- [ ] **Step 4: Run all tests**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass (the ProfilePage.spec.tsx tests we wrote in Task 3 cover the real logic).

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/profile/index.ts \
        apps/web-people/src/app/profile/[employmentId]/page.tsx \
        apps/web-people/src/app/profile/[employmentId]/page.spec.tsx
git commit -m "feat(web-people): slim page.tsx to thin shell, add profile barrel index"
```
