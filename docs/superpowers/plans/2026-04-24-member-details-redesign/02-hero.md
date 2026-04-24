# Member Details Redesign — Plan 02: ProfileHero + RehireDialog

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ProfileHero` — the 72px avatar, name+status row, meta row, contact row, terminated banner, action buttons, and `TabsList` — plus the `RehireDialog` UI stub.

**Architecture:** `ProfileHero` renders inside a `<Tabs>` context owned by `ProfilePage`. It contributes `<TabsList>` (6 triggers) but does not wrap `<Tabs>` itself. `RehireDialog` is a controlled modal opened by the "Rehire" button in the terminated banner.

**Tech Stack:** React, @future/ui (Tabs, TabsList, TabsTrigger, Button, DropdownMenu, Dialog), @future/ui/icons (Mail, Phone, Calendar, Edit, Share2, MoreHorizontal, Download, UserMinus, Plus), StatusBadge component, Vitest + @testing-library/react

---

## Files

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `apps/web-people/src/components/profile/hero/ProfileHero.tsx`       |
| Create | `apps/web-people/src/components/profile/hero/ProfileHero.spec.tsx`  |
| Create | `apps/web-people/src/components/profile/hero/RehireDialog.tsx`      |
| Create | `apps/web-people/src/components/profile/hero/RehireDialog.spec.tsx` |

**Prerequisite:** Plan 01 complete (ProfilePage.tsx exists, types updated).

---

### Task 1: ProfileHero

**Files:**

- Create: `apps/web-people/src/components/profile/hero/ProfileHero.spec.tsx`
- Create: `apps/web-people/src/components/profile/hero/ProfileHero.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/hero/ProfileHero.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileHero } from './ProfileHero'
import type { EmployeeProfile } from '../../../lib/types'
import type { ProfilePermissions } from '../ProfilePage'

vi.mock('../../../components/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}))

vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    TabsList: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="tabs-list">{children}</div>
    ),
    TabsTrigger: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <button data-value={value}>{children}</button>
    ),
  }
})

vi.mock('./RehireDialog', () => ({
  RehireDialog: () => <div data-testid="rehire-dialog" />,
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
    preferredName: null,
    nameDisplayOrder: 'given_first',
    dateOfBirth: null,
    gender: null,
    nationality: null,
    maritalStatus: null,
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
    workArrangement: null,
  },
  currentJob: {
    id: 'job-1',
    jobProfileId: 'jp-1',
    jobTitle: 'Senior Engineer',
    jobLevel: 'L5',
    jobFamilyName: 'Engineering',
    departmentId: 'dept-1',
    departmentName: 'Engineering',
    locationId: 'loc-1',
    locationName: 'Singapore',
    costCenter: null,
    managerId: null,
    managerName: null,
    effectiveDate: '2023-01-15',
  },
  emergencyContacts: [],
  addresses: [],
  countryFields: [],
  customFields: [],
  bankDetails: null,
  probation: null,
  completenessScore: 0,
  completenessMissing: [],
}

const noPerms: ProfilePermissions = {
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

describe('ProfileHero', () => {
  it('renders full name', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Alice Johnson')).toBeTruthy()
  })

  it('renders status badge from employment status', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('active')).toBeTruthy()
  })

  it('renders job title and department from currentJob', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Senior Engineer')).toBeTruthy()
    expect(screen.getByText('Engineering')).toBeTruthy()
  })

  it('renders company email in contact row', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('alice@co.com')).toBeTruthy()
  })

  it('renders 6 tab triggers', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    const tabList = screen.getByTestId('tabs-list')
    expect(tabList.querySelectorAll('button').length).toBe(6)
  })

  it('hides Edit profile button when canEdit is false', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.queryByText('Edit profile')).toBeNull()
  })

  it('shows Edit profile button when canEdit is true', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={{ ...noPerms, canEdit: true }}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Edit profile')).toBeTruthy()
  })

  it('shows terminated banner when employmentStatus is terminated', () => {
    const terminated: EmployeeProfile = {
      ...baseProfile,
      employment: {
        ...baseProfile.employment,
        employmentStatus: 'terminated',
        terminationDate: '2026-03-12',
        terminationReason: 'Resignation',
      },
    }
    render(
      <ProfileHero profile={terminated} permissions={noPerms} onEdit={vi.fn()} onShare={vi.fn()} />,
    )
    expect(screen.getByText(/Employment ended/)).toBeTruthy()
    expect(screen.getByText('Rehire')).toBeTruthy()
  })

  it('does not show terminated banner for active employees', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        onEdit={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Employment ended/)).toBeNull()
  })

  it('opens RehireDialog when Rehire is clicked', async () => {
    const terminated: EmployeeProfile = {
      ...baseProfile,
      employment: {
        ...baseProfile.employment,
        employmentStatus: 'terminated',
        terminationDate: '2026-03-12',
        terminationReason: 'Resignation',
      },
    }
    render(
      <ProfileHero profile={terminated} permissions={noPerms} onEdit={vi.fn()} onShare={vi.fn()} />,
    )
    await userEvent.click(screen.getByText('Rehire'))
    expect(screen.getByTestId('rehire-dialog')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "ProfileHero"
```

Expected: FAIL with "Cannot find module './ProfileHero'".

- [ ] **Step 3: Create ProfileHero.tsx**

Create `apps/web-people/src/components/profile/hero/ProfileHero.tsx`:

```tsx
'use client'

import * as React from 'react'
import Image from 'next/image'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TabsList,
  TabsTrigger,
} from '@future/ui'
import {
  Edit,
  Share2,
  MoreHorizontal,
  Download,
  UserMinus,
  Mail,
  Phone,
  Calendar,
} from '@future/ui/icons'
import { StatusBadge } from '../../StatusBadge'
import { RehireDialog } from './RehireDialog'
import type { EmployeeProfile } from '../../../lib/types'
import type { ProfilePermissions } from '../ProfilePage'

interface ProfileHeroProps {
  profile: EmployeeProfile
  permissions: ProfilePermissions
  onEdit: () => void
  onShare: () => void
  onStartOffboarding?: () => void
}

export function ProfileHero({
  profile,
  permissions,
  onEdit,
  onShare,
  onStartOffboarding,
}: ProfileHeroProps) {
  const { personProfile, employment, currentJob } = profile
  const [showRehire, setShowRehire] = React.useState(false)
  const isTerminated = employment.employmentStatus === 'terminated'

  const initials = personProfile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const joinedMonths = React.useMemo(() => {
    const ms = Date.now() - new Date(employment.hireDate).getTime()
    return Math.floor(ms / (1000 * 60 * 60 * 24 * 30))
  }, [employment.hireDate])

  return (
    <div className="border-b border-border">
      <div className="px-8 pt-6">
        {/* Action buttons — top right */}
        <div className="flex justify-end gap-2 mb-4">
          {permissions.canEdit && (
            <Button variant="default" size="sm" onClick={onEdit} className="gap-1.5">
              <Edit className="h-3.5 w-3.5" />
              Edit profile
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onShare} className="gap-1.5">
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
          {permissions.canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download PDF
                </DropdownMenuItem>
                {onStartOffboarding && (
                  <DropdownMenuItem onClick={onStartOffboarding} className="text-red-400">
                    <UserMinus className="mr-2 h-3.5 w-3.5" />
                    Start Offboarding
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Avatar + identity */}
        <div className="flex items-start gap-5">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-secondary/50 text-xl font-510 text-secondary-foreground">
            {personProfile.photoUrl ? (
              <Image
                src={personProfile.photoUrl}
                alt={personProfile.fullName}
                width={72}
                height={72}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + status */}
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-510 tracking-tight text-foreground">
                {personProfile.fullName}
                {personProfile.preferredName && (
                  <span className="ml-2 text-lg font-normal text-muted-foreground">
                    ({personProfile.preferredName})
                  </span>
                )}
              </h1>
              <StatusBadge status={employment.employmentStatus} />
            </div>

            {/* Meta row: title · dept · location · level */}
            {currentJob && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <span className="text-secondary-foreground">{currentJob.jobTitle}</span>
                <span className="text-border">·</span>
                <span>{currentJob.departmentName}</span>
                {currentJob.locationName && (
                  <>
                    <span className="text-border">·</span>
                    <span>{currentJob.locationName}</span>
                  </>
                )}
                {currentJob.jobLevel && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono text-xs">{currentJob.jobLevel}</span>
                  </>
                )}
              </div>
            )}

            {/* Contact row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {employment.companyEmail && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" />
                  {employment.companyEmail}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Joined {joinedMonths} months ago
              </span>
            </div>
          </div>
        </div>

        {/* Terminated banner */}
        {isTerminated && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-510 text-red-300">
                Employment ended{' '}
                {employment.terminationDate
                  ? new Date(employment.terminationDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : ''}
                {employment.terminationReason && ` · ${employment.terminationReason}`}
              </p>
              <p className="mt-0.5 text-xs text-red-400/75">
                Read-only. Record preserved for compliance.
                {employment.employeeCode && (
                  <>
                    {' '}
                    Previous profile: <code>{employment.employeeCode}</code>
                  </>
                )}
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowRehire(true)}
              className="shrink-0"
            >
              Rehire
            </Button>
          </div>
        )}

        {showRehire && (
          <RehireDialog
            open={showRehire}
            onClose={() => setShowRehire(false)}
            employeeName={personProfile.fullName}
          />
        )}

        {/* Tab strip */}
        <TabsList className="mt-5 -mb-px h-auto rounded-none border-0 bg-transparent p-0 gap-0">
          {[
            { value: 'overview', label: 'Overview' },
            { value: 'job-history', label: 'Job history' },
            { value: 'documents', label: 'Documents' },
            { value: 'compensation', label: 'Compensation' },
            { value: 'changes', label: 'Change requests' },
            { value: 'activity', label: 'Activity' },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-510 text-muted-foreground data-[state=active]:border-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "ProfileHero"
```

Expected: all ProfileHero tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/profile/hero/
git commit -m "feat(web-people): add ProfileHero with avatar, meta, contact row and tab strip"
```

---

### Task 2: RehireDialog

**Files:**

- Create: `apps/web-people/src/components/profile/hero/RehireDialog.spec.tsx`
- Create: `apps/web-people/src/components/profile/hero/RehireDialog.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/hero/RehireDialog.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RehireDialog } from './RehireDialog'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RehireDialog', () => {
  it('renders dialog title when open', () => {
    render(<RehireDialog open={true} onClose={vi.fn()} employeeName="Alice Johnson" />)
    expect(screen.getByText('Rehire Alice Johnson')).toBeTruthy()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    render(<RehireDialog open={true} onClose={onClose} employeeName="Alice Johnson" />)
    await userEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Start rehire is clicked', async () => {
    const onClose = vi.fn()
    render(<RehireDialog open={true} onClose={onClose} employeeName="Alice Johnson" />)
    await userEvent.click(screen.getByText('Start rehire'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders new start date, employment type, and job title fields', () => {
    render(<RehireDialog open={true} onClose={vi.fn()} employeeName="Alice Johnson" />)
    expect(screen.getByLabelText('New start date')).toBeTruthy()
    expect(screen.getByLabelText('Employment type')).toBeTruthy()
    expect(screen.getByLabelText('Job title')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "RehireDialog"
```

Expected: FAIL with "Cannot find module './RehireDialog'".

- [ ] **Step 3: Create RehireDialog.tsx**

Create `apps/web-people/src/components/profile/hero/RehireDialog.tsx`:

```tsx
'use client'

import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@future/ui'

interface RehireDialogProps {
  open: boolean
  onClose: () => void
  employeeName: string
}

export function RehireDialog({ open, onClose, employeeName }: RehireDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rehire {employeeName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rehire-start-date">New start date</Label>
            <Input id="rehire-start-date" type="date" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rehire-employment-type">Employment type</Label>
            <Select>
              <SelectTrigger id="rehire-employment-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">Permanent</SelectItem>
                <SelectItem value="fixed_term">Fixed-term</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rehire-job-title">Job title</Label>
            <Input id="rehire-job-title" placeholder="e.g. Senior Engineer" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              // TODO: wire to people.rehireEmployee mutation
              console.log('Rehire submitted')
              onClose()
            }}
          >
            Start rehire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "RehireDialog"
```

Expected: all RehireDialog tests pass.

- [ ] **Step 5: Run all tests**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/profile/hero/RehireDialog.tsx \
        apps/web-people/src/components/profile/hero/RehireDialog.spec.tsx
git commit -m "feat(web-people): add RehireDialog UI stub"
```
