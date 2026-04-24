# Member Details Redesign — Plan 05: TabOverview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `TabOverview` to use the new 2-column layout (`[1fr_300px]`) with four `ProfileCard` sections in the main column and `SideRail` in the right rail.

**Architecture:** `TabOverview` is a pure layout component — it delegates all data to props and child components. It receives `profile` (the full `EmployeeProfile`) plus `canEditPersonal` and `canViewSalary` permission flags. The `SideRail` receives `employmentId` and handles its own async fetches internally.

**Tech Stack:** React, TypeScript, `ProfileCard` + `KVRow` from `../cards/ProfileCard`, `SideRail` from `../rail/SideRail`, Vitest + @testing-library/react

---

## Files

| Action | Path                                                               |
| ------ | ------------------------------------------------------------------ |
| Modify | `apps/web-people/src/components/profile/tabs/TabOverview.tsx`      |
| Modify | `apps/web-people/src/components/profile/tabs/TabOverview.spec.tsx` |

Note: these files currently live at `src/components/profile/TabOverview.tsx`. They move to `tabs/` subfolder as part of this plan — the old files at the root of `profile/` should be deleted after the new ones are created.

**Prerequisite:** Plans 01–04 complete.

---

### Task 1: Rewrite TabOverview

**Files:**

- Create: `apps/web-people/src/components/profile/tabs/TabOverview.spec.tsx`
- Create: `apps/web-people/src/components/profile/tabs/TabOverview.tsx`
- Delete: `apps/web-people/src/components/profile/TabOverview.tsx`
- Delete: `apps/web-people/src/components/profile/TabOverview.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/tabs/TabOverview.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TabOverview } from './TabOverview'
import type { EmployeeProfile } from '../../../lib/types'

vi.mock('../cards/ProfileCard', () => ({
  ProfileCard: ({
    title,
    locked,
    children,
  }: {
    title: string
    locked?: boolean
    children: React.ReactNode
  }) => (
    <div data-testid={`profile-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      {locked && <span data-testid="locked-indicator" />}
      {children}
    </div>
  ),
  KVRow: ({ label, value }: { label: string; value: string | null }) => (
    <div>
      <span>{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  ),
}))

vi.mock('../rail/SideRail', () => ({
  SideRail: ({ employmentId }: { employmentId: string }) => (
    <div data-testid={`side-rail-${employmentId}`} />
  ),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      getDirectReports: { query: vi.fn().mockResolvedValue([]) },
      getActivityFeed: { query: vi.fn().mockResolvedValue({ events: [], nextCursor: null }) },
    },
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const baseProfile: EmployeeProfile = {
  personProfile: {
    id: 'pp-1',
    actorId: 'actor-1',
    familyName: 'Johnson',
    givenName: 'Alice',
    middleName: null,
    fullName: 'Alice Johnson',
    preferredName: 'Ali',
    nameDisplayOrder: 'given_first',
    dateOfBirth: '1990-01-15',
    gender: 'female',
    nationality: 'SG',
    maritalStatus: 'single',
    photoUrl: null,
  },
  employment: {
    id: 'emp-1',
    employeeCode: 'E-001',
    companyEmail: 'alice@co.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'SG',
    employmentStatus: 'active',
    hireDate: '2023-01-15',
    terminationDate: null,
    terminationReason: null,
    workArrangement: 'hybrid',
  },
  currentJob: {
    id: 'job-1',
    jobProfileId: 'jp-1',
    jobTitle: 'Senior Engineer',
    jobLevel: 'L5',
    jobFamilyName: 'Engineering',
    departmentId: 'dept-1',
    departmentName: 'Engineering',
    locationId: null,
    locationName: null,
    costCenter: null,
    managerId: null,
    managerName: null,
    effectiveDate: '2023-01-15',
  },
  emergencyContacts: [
    {
      id: 'ec-1',
      name: 'Bob Johnson',
      relationship: 'Spouse',
      phone: '+65 9999 0000',
      email: null,
    },
  ],
  addresses: [],
  countryFields: [],
  customFields: [],
  bankDetails: null,
  probation: null,
  completenessScore: 82,
  completenessMissing: ['dateOfBirth'],
}

describe('TabOverview', () => {
  it('renders the About card', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canViewSalary={false}
      />,
    )
    expect(screen.getByTestId('profile-card-about')).toBeTruthy()
  })

  it('renders the Job card', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canViewSalary={false}
      />,
    )
    expect(screen.getByTestId('profile-card-job')).toBeTruthy()
  })

  it('renders the Compensation card locked when canViewSalary is false', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canViewSalary={false}
      />,
    )
    expect(screen.getByTestId('profile-card-compensation')).toBeTruthy()
    expect(screen.getByTestId('locked-indicator')).toBeTruthy()
  })

  it('renders the Compensation card unlocked when canViewSalary is true', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canViewSalary={true}
      />,
    )
    expect(screen.queryByTestId('locked-indicator')).toBeNull()
  })

  it('renders emergency contact names', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canViewSalary={false}
      />,
    )
    expect(screen.getByText('Bob Johnson')).toBeTruthy()
  })

  it('renders the SideRail with correct employmentId', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canViewSalary={false}
      />,
    )
    expect(screen.getByTestId('side-rail-emp-1')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "tabs/TabOverview"
```

Expected: FAIL with "Cannot find module './TabOverview'".

- [ ] **Step 3: Create tabs/TabOverview.tsx**

Create `apps/web-people/src/components/profile/tabs/TabOverview.tsx`:

```tsx
'use client'

import { ProfileCard, KVRow } from '../cards/ProfileCard'
import { SideRail } from '../rail/SideRail'
import type { EmployeeProfile } from '../../../lib/types'

interface TabOverviewProps {
  profile: EmployeeProfile
  employmentId: string
  canEditPersonal: boolean
  canViewSalary: boolean
}

export function TabOverview({
  profile,
  employmentId,
  canEditPersonal,
  canViewSalary,
}: TabOverviewProps) {
  const { personProfile, employment, currentJob, emergencyContacts } = profile

  return (
    <div className="grid grid-cols-[1fr_300px] gap-8 p-8">
      {/* Main column */}
      <div className="flex flex-col gap-5">
        {/* About */}
        <ProfileCard
          title="About"
          action={canEditPersonal ? { label: 'Edit', onClick: () => {} } : undefined}
        >
          <KVRow label="Preferred name" value={personProfile.preferredName} />
          <KVRow label="Start date" value={employment.hireDate} />
          <KVRow label="Employee ID" value={employment.employeeCode} mono />
        </ProfileCard>

        {/* Job */}
        <ProfileCard title="Job">
          <KVRow label="Job title" value={currentJob?.jobTitle ?? null} />
          <KVRow label="Level" value={currentJob?.jobLevel ?? null} mono />
          <KVRow label="Department" value={currentJob?.departmentName ?? null} />
          <KVRow label="Employment type" value={employment.employmentType} />
          <KVRow label="Work arrangement" value={employment.workArrangement} />
        </ProfileCard>

        {/* Compensation */}
        <ProfileCard title="Compensation" locked={!canViewSalary}>
          {!canViewSalary ? (
            <p className="py-1.5 text-xs text-muted-foreground">
              Restricted. You can view salary with{' '}
              <code className="font-mono text-secondary-foreground">people:salary:read</code>{' '}
              permission.
            </p>
          ) : (
            <p className="py-1.5 text-xs text-muted-foreground">Salary data loading…</p>
          )}
        </ProfileCard>

        {/* Emergency contacts */}
        <ProfileCard
          title="Emergency contacts"
          action={canEditPersonal ? { label: 'Add', onClick: () => {} } : undefined}
        >
          {emergencyContacts.length === 0 ? (
            <p className="py-1.5 text-xs text-muted-foreground">No emergency contacts added.</p>
          ) : (
            <div className="space-y-2 py-1">
              {emergencyContacts.map((contact, i) => (
                <div key={contact.id} className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-[10px] font-510 text-secondary-foreground">
                    {contact.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-510 text-foreground">{contact.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {contact.relationship} · {contact.phone}
                    </p>
                  </div>
                  {i === 0 && (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </ProfileCard>
      </div>

      {/* Side rail */}
      <SideRail profile={profile} employmentId={employmentId} onViewAll={() => {}} />
    </div>
  )
}
```

- [ ] **Step 4: Delete the old root-level TabOverview files**

```bash
rm apps/web-people/src/components/profile/TabOverview.tsx
rm apps/web-people/src/components/profile/TabOverview.spec.tsx
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "TabOverview"
```

Expected: new tabs/TabOverview tests pass. No failures from deleted files.

- [ ] **Step 6: Run full suite**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web-people/src/components/profile/tabs/TabOverview.tsx \
        apps/web-people/src/components/profile/tabs/TabOverview.spec.tsx
git add -u apps/web-people/src/components/profile/TabOverview.tsx \
          apps/web-people/src/components/profile/TabOverview.spec.tsx
git commit -m "feat(web-people): rewrite TabOverview with 2-col layout and SideRail"
```
