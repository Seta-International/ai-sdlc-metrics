# Profile Change Request — Plan 02: Profile Edit Mode (web-people)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the employee profile from read-only to an edit-mode experience. Clicking "Edit profile" enables all fields as inputs; a bottom action bar accumulates changes and collects a reason; clicking "Submit" fires `people.requestProfileChanges`; each pending field shows a yellow "Pending" badge inline.

**Architecture:** `ProfilePage.tsx` owns `isEditing` state and a `dirtyFields` map. It passes both down to `TabOverview` (which renders the editable fields) and to a new `EditProfileBar` component (the submit bar). `TabChangeRequests` is wired to the real `people.listProfileChangeRequests` tRPC route.

**Prerequisites:** Plan 01 must be complete — the `requestProfileChanges` tRPC route must accept `reason` and use auth context, and `listProfileChangeRequests` must be implemented.

**Tech Stack:** Next.js (App Router, `'use client'`), React, tRPC fetch client, `@future/ui`, Vitest + React Testing Library

---

## Task 1: Lift dirty-field tracking into `ProfilePage` and update `TabOverview` props

**Files:**

- Modify: `apps/web-people/src/components/profile/ProfilePage.tsx`
- Modify: `apps/web-people/src/components/profile/tabs/TabOverview.tsx`
- Test: `apps/web-people/src/components/profile/tabs/TabOverview.edit.spec.tsx`

`ProfilePage` already has an `isEditing` boolean. Add a `dirtyFields: Map<string, {old: unknown; new: unknown}>` alongside it, pass both to `TabOverview`, and let `TabOverview` call an `onFieldChange` callback instead of saving inline.

- [ ] **Step 1: Write the failing component spec**

Create `apps/web-people/src/components/profile/tabs/TabOverview.edit.spec.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabOverview } from './TabOverview'
import type { EmployeeProfile } from '../../../lib/types'

vi.mock('../../../lib/trpc', () => ({ trpc: {} }))
vi.mock('../../../lib/hooks/use-change-requests', () => ({
  usePendingFieldPaths: () => new Set(),
}))

function makeProfile(): EmployeeProfile {
  return {
    personProfile: {
      id: 'pp-1',
      actorId: 'actor-1',
      familyName: 'Nguyen',
      givenName: 'An',
      middleName: null,
      fullName: 'Nguyen An',
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
      employeeCode: 'EMP001',
      companyEmail: 'an@seta.vn',
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employmentStatus: 'active',
      hireDate: new Date('2025-01-01'),
      terminationDate: null,
      terminationReason: null,
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

describe('TabOverview — edit mode', () => {
  it('does not render preferred-name input when not editing', () => {
    render(
      <TabOverview
        profile={makeProfile()}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.queryByRole('textbox', { name: /preferred name/i })).toBeNull()
  })

  it('renders preferred-name as an input when editing', () => {
    render(
      <TabOverview
        profile={makeProfile()}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={true}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox', { name: /preferred name/i })).toBeTruthy()
  })

  it('calls onFieldChange when a field is modified', () => {
    const onFieldChange = vi.fn()
    render(
      <TabOverview
        profile={makeProfile()}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={true}
        dirtyFields={new Map()}
        onFieldChange={onFieldChange}
        onSaved={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /preferred name/i }), {
      target: { value: 'An Nguyen' },
    })
    expect(onFieldChange).toHaveBeenCalledWith(
      'person_profile.preferred_name',
      null,
      'An Nguyen',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "TabOverview"
```

Expected: FAIL — `dirtyFields` and `onFieldChange` props don't exist on `TabOverview`.

- [ ] **Step 3: Update `TabOverview` props interface and remove inline save buttons**

In `apps/web-people/src/components/profile/tabs/TabOverview.tsx`:

Replace the `TabOverviewProps` interface:

```typescript
interface TabOverviewProps {
  profile: EmployeeProfile
  employmentId: string
  canEditPersonal: boolean
  canEditBank: boolean
  canViewSalary: boolean
  isEditing: boolean
  dirtyFields: Map<string, { old: unknown; new: unknown }>
  onFieldChange: (fieldPath: string, oldValue: unknown, newValue: unknown) => void
  onSaved: () => void
}
```

Update the function signature to destructure the new props:

```typescript
export function TabOverview({
  profile,
  employmentId,
  canEditPersonal,
  canEditBank: _canEditBank,
  canViewSalary,
  isEditing,
  dirtyFields,
  onFieldChange,
  onSaved: _onSaved,
}: TabOverviewProps) {
```

Remove the old `aboutForm`, `contactForm`, `isAboutPending`, `isContactPending` state, and the `saveAbout` / `saveContact` functions entirely — the action bar replaces them.

For each editable field, switch the render pattern to:

```typescript
// Preferred name — read mode shows value + pending badge (next task),
// edit mode shows Input that calls onFieldChange
{isEditing && canEditPersonal ? (
  <Input
    aria-label="Preferred name"
    value={
      dirtyFields.has('person_profile.preferred_name')
        ? String(dirtyFields.get('person_profile.preferred_name')!.new ?? '')
        : (personProfile.preferredName ?? '')
    }
    onChange={(e) =>
      onFieldChange('person_profile.preferred_name', personProfile.preferredName, e.target.value)
    }
  />
) : (
  <span>{personProfile.preferredName ?? '—'}</span>
)}
```

Apply the same pattern for these fields (adjust `aria-label` and `fieldPath` accordingly):

- `person_profile.preferred_name`
- `person_profile.date_of_birth`
- `person_profile.nationality`
- `employment_detail.personal_email`
- `employment_detail.personal_phone`

- [ ] **Step 4: Update `ProfilePage` to manage `dirtyFields` and pass to `TabOverview`**

In `apps/web-people/src/components/profile/ProfilePage.tsx`:

Add state below `isEditing`:

```typescript
const [dirtyFields, setDirtyFields] = React.useState(
  new Map<string, { old: unknown; new: unknown }>(),
)
```

Add handler:

```typescript
function handleFieldChange(fieldPath: string, oldValue: unknown, newValue: unknown) {
  setDirtyFields((prev) => {
    const next = new Map(prev)
    next.set(fieldPath, { old: oldValue, new: newValue })
    return next
  })
}
```

Replace the cancel handler:

```typescript
function handleCancelEdit() {
  setIsEditing(false)
  setDirtyFields(new Map())
}
```

Update `ProfileHero` call's `onDoneEditing`:

```typescript
onDoneEditing = { handleCancelEdit }
```

Update `TabOverview` call to pass the new props:

```typescript
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "TabOverview"
```

Expected: PASS (3 tests green)

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/profile/ProfilePage.tsx \
        apps/web-people/src/components/profile/tabs/TabOverview.tsx \
        apps/web-people/src/components/profile/tabs/TabOverview.edit.spec.tsx
git commit -m "feat(web-people): dirty-field tracking in ProfilePage, editable inputs in TabOverview"
```

---

## Task 2: Build the `EditProfileBar` component

**Files:**

- Create: `apps/web-people/src/components/profile/EditProfileBar.tsx`
- Test: `apps/web-people/src/components/profile/EditProfileBar.spec.tsx`
- Modify: `apps/web-people/src/components/profile/ProfilePage.tsx`

`EditProfileBar` is a sticky bottom bar that appears during edit mode. It shows the count of dirty fields, a reason textarea, a Cancel button, and a Submit button (disabled when no dirty fields or while submitting).

- [ ] **Step 1: Write the failing tests**

Create `apps/web-people/src/components/profile/EditProfileBar.spec.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditProfileBar } from './EditProfileBar'

describe('EditProfileBar', () => {
  it('disables Submit when no dirty fields', () => {
    render(
      <EditProfileBar
        dirtyCount={0}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  it('enables Submit when there are dirty fields', () => {
    render(
      <EditProfileBar
        dirtyCount={2}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled()
  })

  it('shows the field count', () => {
    render(
      <EditProfileBar
        dirtyCount={3}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    expect(screen.getByText(/3 field/i)).toBeTruthy()
  })

  it('disables Submit while isSubmitting', () => {
    render(
      <EditProfileBar
        dirtyCount={1}
        reason="reason"
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        isSubmitting={true}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <EditProfileBar
        dirtyCount={1}
        reason=""
        onReasonChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onSubmit when Submit is clicked with dirty fields', () => {
    const onSubmit = vi.fn()
    render(
      <EditProfileBar
        dirtyCount={1}
        reason="just testing"
        onReasonChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "EditProfileBar"
```

Expected: FAIL — `EditProfileBar` does not exist.

- [ ] **Step 3: Create `EditProfileBar`**

Create `apps/web-people/src/components/profile/EditProfileBar.tsx`:

```typescript
'use client'

import * as React from 'react'
import { Button, Textarea, Spinner } from '@future/ui'

interface EditProfileBarProps {
  dirtyCount: number
  reason: string
  onReasonChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
  isSubmitting: boolean
}

export function EditProfileBar({
  dirtyCount,
  reason,
  onReasonChange,
  onCancel,
  onSubmit,
  isSubmitting,
}: EditProfileBarProps) {
  const canSubmit = dirtyCount > 0 && !isSubmitting

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background shadow-lg">
      <div className="container mx-auto flex items-center gap-4 py-3">
        <span className="text-sm text-fg-muted shrink-0">
          {dirtyCount} field{dirtyCount !== 1 ? 's' : ''} changed
        </span>
        <Textarea
          className="flex-1 min-h-0 h-9 resize-none py-1.5"
          placeholder="Reason for changes (optional)"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
          {isSubmitting && <Spinner className="size-4 mr-2" />}
          Submit
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "EditProfileBar"
```

Expected: PASS (6 tests green)

- [ ] **Step 5: Wire `EditProfileBar` into `ProfilePage`**

In `apps/web-people/src/components/profile/ProfilePage.tsx`:

Add import:

```typescript
import { EditProfileBar } from './EditProfileBar'
```

Add state for reason and submission status (below `dirtyFields`):

```typescript
const [editReason, setEditReason] = React.useState('')
const [isSubmitting, setIsSubmitting] = React.useState(false)
```

Add `handleSubmitChanges` (before the return statement):

```typescript
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
```

Add the bar to the JSX inside `<main>`, after the closing `</Tabs>` tag:

```typescript
        {isEditing && (
          <EditProfileBar
            dirtyCount={dirtyFields.size}
            reason={editReason}
            onReasonChange={setEditReason}
            onCancel={handleCancelEdit}
            onSubmit={() => { void handleSubmitChanges() }}
            isSubmitting={isSubmitting}
          />
        )}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web-people/src/components/profile/EditProfileBar.tsx \
        apps/web-people/src/components/profile/EditProfileBar.spec.tsx \
        apps/web-people/src/components/profile/ProfilePage.tsx
git commit -m "feat(web-people): EditProfileBar — field count, reason textarea, submit/cancel wired to requestProfileChanges"
```

---

## Task 3: Add "Pending" badge to fields with active change requests

**Files:**

- Modify: `apps/web-people/src/lib/hooks/use-change-requests.ts`
- Modify: `apps/web-people/src/components/profile/tabs/TabOverview.tsx`
- Test: `apps/web-people/src/lib/hooks/use-change-requests.spec.ts`

While in read mode, any field that has a pending change request shows a small yellow "Pending" badge next to its value. The hook fetches `listProfileChangeRequests` in `byEmployment/pending` mode and exports a `usePendingFieldPaths` helper that returns a `Set<string>`.

- [ ] **Step 1: Write the failing test for `usePendingFieldPaths`**

Create `apps/web-people/src/lib/hooks/use-change-requests.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('use-change-requests module', () => {
  it('exports useChangeRequests function', async () => {
    const mod = await import('./use-change-requests')
    expect(typeof mod.useChangeRequests).toBe('function')
  })

  it('exports usePendingFieldPaths function', async () => {
    const mod = await import('./use-change-requests')
    expect(typeof mod.usePendingFieldPaths).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify the current state**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 5 "use-change-requests"
```

The test for `usePendingFieldPaths` will fail because the current hook stub does not export it.

- [ ] **Step 3: Rewrite `use-change-requests.ts` to call the real endpoint**

Replace `apps/web-people/src/lib/hooks/use-change-requests.ts`:

```typescript
'use client'

import * as React from 'react'
import { trpc } from '../trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export interface ChangeRequestSummary {
  id: string
  fieldPath: string
  batchId: string | null
  status: string
  reason: string | null
  reviewNote: string | null
  oldValue: unknown
  newValue: unknown
  createdAt: Date
}

export function useChangeRequests(employmentId: string): {
  items: ChangeRequestSummary[]
  isLoading: boolean
} {
  const [items, setItems] = React.useState<ChangeRequestSummary[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    void anyTrpc.people.listProfileChangeRequests
      .query({ mode: 'byEmployment', employmentId })
      .then((result: { items: ChangeRequestSummary[] } | null) => {
        if (cancelled) return
        setItems(result?.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [employmentId])

  return { items, isLoading }
}

/** Returns a Set of fieldPaths that have a pending change request */
export function usePendingFieldPaths(employmentId: string): Set<string> {
  const { items } = useChangeRequests(employmentId)
  return React.useMemo(
    () => new Set(items.filter((i) => i.status === 'pending').map((i) => i.fieldPath)),
    [items],
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 5 "use-change-requests"
```

Expected: PASS

- [ ] **Step 5: Add pending badge to `TabOverview` fields**

In `apps/web-people/src/components/profile/tabs/TabOverview.tsx`:

Add import at the top:

```typescript
import { usePendingFieldPaths } from '../../../lib/hooks/use-change-requests'
```

Inside the component function (after destructuring props), add:

```typescript
const pendingFields = usePendingFieldPaths(employmentId)
```

For each editable field in read mode, wrap the value span to include the badge when that field is pending. Example for preferred name:

```typescript
{isEditing && canEditPersonal ? (
  <Input
    aria-label="Preferred name"
    value={
      dirtyFields.has('person_profile.preferred_name')
        ? String(dirtyFields.get('person_profile.preferred_name')!.new ?? '')
        : (personProfile.preferredName ?? '')
    }
    onChange={(e) =>
      onFieldChange('person_profile.preferred_name', personProfile.preferredName, e.target.value)
    }
  />
) : (
  <span className="flex items-center gap-2">
    {personProfile.preferredName ?? '—'}
    {pendingFields.has('person_profile.preferred_name') && (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
        Pending
      </span>
    )}
  </span>
)}
```

Apply the same inline badge pattern for every editable field:

- `person_profile.preferred_name`
- `person_profile.date_of_birth`
- `person_profile.nationality`
- `employment_detail.personal_email`
- `employment_detail.personal_phone`

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web-people/src/lib/hooks/use-change-requests.ts \
        apps/web-people/src/lib/hooks/use-change-requests.spec.ts \
        apps/web-people/src/components/profile/tabs/TabOverview.tsx
git commit -m "feat(web-people): pending field badges via usePendingFieldPaths hook"
```

---

## Task 4: Wire `TabChangeRequests` to real data

**Files:**

- Modify: `apps/web-people/src/components/profile/tabs/TabChangeRequests.tsx`
- Test: `apps/web-people/src/components/profile/tabs/TabChangeRequests.spec.tsx`

Replace mock data with real `useChangeRequests` calls. Render filter tabs (all / pending / approved / rejected). Show rejection reason when present.

- [ ] **Step 1: Write the failing component spec**

Create `apps/web-people/src/components/profile/tabs/TabChangeRequests.spec.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TabChangeRequests } from './TabChangeRequests'
import type { ChangeRequestSummary } from '../../../lib/hooks/use-change-requests'

vi.mock('../../../lib/trpc', () => ({ trpc: {} }))

let mockItems: ChangeRequestSummary[] = []
vi.mock('../../../lib/hooks/use-change-requests', () => ({
  useChangeRequests: () => ({ items: mockItems, isLoading: false }),
  usePendingFieldPaths: () => new Set(),
}))

describe('TabChangeRequests', () => {
  beforeEach(() => {
    mockItems = []
  })

  it('shows empty state when no requests', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText(/no change requests/i)).toBeTruthy()
  })

  it('renders a pending request with Pending badge', () => {
    mockItems = [
      {
        id: 'cr-1',
        fieldPath: 'person_profile.preferred_name',
        batchId: 'batch-1',
        status: 'pending',
        reason: 'Post-promotion',
        reviewNote: null,
        oldValue: 'Old',
        newValue: 'New',
        createdAt: new Date('2026-05-01'),
      },
    ]
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it('shows rejection note for rejected requests', () => {
    mockItems = [
      {
        id: 'cr-2',
        fieldPath: 'person_profile.preferred_name',
        batchId: 'batch-2',
        status: 'rejected',
        reason: null,
        reviewNote: 'Not approved per policy',
        oldValue: 'Old',
        newValue: 'New',
        createdAt: new Date('2026-05-01'),
      },
    ]
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText(/not approved per policy/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "TabChangeRequests"
```

Expected: FAIL — component still uses mock data.

- [ ] **Step 3: Rewrite `TabChangeRequests`**

Replace `apps/web-people/src/components/profile/tabs/TabChangeRequests.tsx`:

```typescript
'use client'

import * as React from 'react'
import { Badge } from '@future/ui'
import { useChangeRequests } from '../../../lib/hooks/use-change-requests'
import type { ChangeRequestSummary } from '../../../lib/hooks/use-change-requests'

type FilterType = 'all' | 'pending' | 'approved' | 'rejected'

const FIELD_LABELS: Record<string, string> = {
  'person_profile.preferred_name': 'Preferred name',
  'person_profile.date_of_birth': 'Date of birth',
  'person_profile.nationality': 'Nationality',
  'person_profile.name_display_order': 'Name display order',
  'employment_detail.personal_email': 'Personal email',
  'employment_detail.personal_phone': 'Personal phone',
  'employment_detail.office_location': 'Office location',
  'employment_detail.work_phone': 'Work phone',
  'employment.company_email': 'Company email',
}

function fieldLabel(path: string): string {
  return FIELD_LABELS[path] ?? path
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
        Pending
      </Badge>
    )
  }
  if (status === 'approved') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
        Approved
      </Badge>
    )
  }
  if (status === 'rejected') {
    return (
      <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
        Rejected
      </Badge>
    )
  }
  return <Badge variant="outline">{status}</Badge>
}

function ChangeRequestCard({ request }: { request: ChangeRequestSummary }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{fieldLabel(request.fieldPath)}</span>
        <StatusBadge status={request.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="line-through">{String(request.oldValue ?? '—')}</span>
        <span>→</span>
        <span className="text-fg font-medium">{String(request.newValue ?? '—')}</span>
      </div>
      {request.reason && (
        <p className="text-xs text-fg-muted">Reason: {request.reason}</p>
      )}
      {request.status === 'rejected' && request.reviewNote && (
        <p className="text-xs text-red-700">Rejection note: {request.reviewNote}</p>
      )}
      <p className="text-xs text-fg-muted">
        Submitted {new Date(request.createdAt).toLocaleDateString()}
      </p>
    </div>
  )
}

interface TabChangeRequestsProps {
  employmentId: string
  canApprove: boolean
}

export function TabChangeRequests({ employmentId }: TabChangeRequestsProps) {
  const [filter, setFilter] = React.useState<FilterType>('all')
  const { items, isLoading } = useChangeRequests(employmentId)

  const filtered = items.filter((r) => filter === 'all' || r.status === filter)
  const counts: Record<FilterType, number> = {
    all: items.length,
    pending: items.filter((r) => r.status === 'pending').length,
    approved: items.filter((r) => r.status === 'approved').length,
    rejected: items.filter((r) => r.status === 'rejected').length,
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-fg-muted">Loading…</div>
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as FilterType[]).map((f) => (
          <button
            key={f}
            className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-fg-muted hover:bg-muted'
            }`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-fg-muted">No change requests found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ChangeRequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "TabChangeRequests"
```

Expected: PASS (3 tests green)

- [ ] **Step 5: Run the full web-people test suite**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit 2>&1 | tail -20
```

Expected: all pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/profile/tabs/TabChangeRequests.tsx \
        apps/web-people/src/components/profile/tabs/TabChangeRequests.spec.tsx
git commit -m "feat(web-people): wire TabChangeRequests to real listProfileChangeRequests query"
```
