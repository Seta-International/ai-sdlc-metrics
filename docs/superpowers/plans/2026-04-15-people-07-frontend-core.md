# People Module — Plan 07: Frontend — Directory, Profile & Self-Service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `web-people` Next.js zone's core pages — Directory (P1), Org Chart (P2), Employee Profile (P3), and My Profile (P4) — against the new people data model (person_profile + employment + job_assignment + job_profile).

**Architecture:** Next.js App Router, React Server Components where possible, `'use client'` for interactive components. All data via tRPC to `apps/api`. Shared components from `@future/ui`. URL state management via existing `table-url-state` pattern.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, @tanstack/react-table, tRPC, Zod, Lucide icons

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Section 20.2 (Pages P1-P4)

**Design Reference:** `DESIGN.md` — dark-mode-first, Inter Variable with `"cv01","ss03"`, weight 510 signature, brand indigo `#5e6ad2`/`#7170ff`

---

## File Structure

### Files to MODIFY

```
apps/web-people/src/navigation.ts                              (rewrite sidebar config)
apps/web-people/src/components/people-directory-table.tsx       (rewrite for new data model)
apps/web-people/src/app/page.tsx                                (update directory page)
```

### Files to CREATE

```
# Shared types
apps/web-people/src/lib/types.ts

# Shared components
apps/web-people/src/components/employee-card.tsx
apps/web-people/src/components/status-badge.tsx
apps/web-people/src/components/field-renderer.tsx
apps/web-people/src/components/timeline-entry.tsx
apps/web-people/src/components/avatar-name-cell.tsx
apps/web-people/src/components/completeness-bar.tsx
apps/web-people/src/components/filter-panel.tsx
apps/web-people/src/components/card-grid-view.tsx

# P1 Directory
apps/web-people/src/components/directory-toolbar.tsx
apps/web-people/src/components/directory-view-toggle.tsx

# P2 Org Chart
apps/web-people/src/app/org-chart/page.tsx
apps/web-people/src/components/org-chart-tree.tsx
apps/web-people/src/components/org-chart-node.tsx
apps/web-people/src/components/org-chart-toolbar.tsx

# P3 Employee Profile
apps/web-people/src/app/profile/[employmentId]/page.tsx
apps/web-people/src/app/profile/[employmentId]/loading.tsx
apps/web-people/src/components/profile/profile-header.tsx
apps/web-people/src/components/profile/profile-tabs.tsx
apps/web-people/src/components/profile/tab-overview.tsx
apps/web-people/src/components/profile/tab-job-history.tsx
apps/web-people/src/components/profile/tab-documents.tsx
apps/web-people/src/components/profile/tab-contracts.tsx
apps/web-people/src/components/profile/tab-sections.tsx
apps/web-people/src/components/profile/tab-change-requests.tsx
apps/web-people/src/components/profile/tab-probation.tsx
apps/web-people/src/components/profile/info-card.tsx
apps/web-people/src/components/profile/document-upload-dialog.tsx
apps/web-people/src/components/profile/contract-card.tsx
apps/web-people/src/components/profile/section-entry-form.tsx

# P4 My Profile
apps/web-people/src/app/me/page.tsx

# tRPC hooks
apps/web-people/src/lib/hooks/use-directory.ts
apps/web-people/src/lib/hooks/use-employee-profile.ts
apps/web-people/src/lib/hooks/use-org-chart.ts
apps/web-people/src/lib/hooks/use-change-requests.ts
apps/web-people/src/lib/hooks/use-documents.ts

# Tests (co-located)
apps/web-people/src/components/status-badge.spec.tsx
apps/web-people/src/components/employee-card.spec.tsx
apps/web-people/src/components/field-renderer.spec.tsx
apps/web-people/src/components/people-directory-table.spec.tsx
apps/web-people/src/components/profile/profile-header.spec.tsx
apps/web-people/src/components/profile/tab-overview.spec.tsx
```

---

## Task 1 — Update `navigation.ts` with all sidebar items

- [ ] **1.1** Rewrite `navigation.ts` to include all sections from spec Section 20.1:

```typescript
// apps/web-people/src/navigation.ts
import {
  Users,
  Network,
  User,
  UserPlus,
  UserMinus,
  FileCheck,
  BarChart3,
  Settings,
} from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const peopleNavConfig: NavigationConfig = {
  navbar: {
    title: 'People',
    icon: Users,
    action: {
      label: 'Add Employee',
      href: '/new',
      permission: 'people:profile:create',
    },
  },
  sidebar: [
    {
      label: 'People',
      items: [
        {
          label: 'Directory',
          icon: Users,
          href: '/',
          permission: 'people:profile:read',
        },
        {
          label: 'Org Chart',
          icon: Network,
          href: '/org-chart',
          permission: 'people:org:read',
        },
        {
          label: 'My Profile',
          icon: User,
          href: '/me',
        },
      ],
    },
    {
      label: 'Workflows',
      items: [
        {
          label: 'Onboarding',
          icon: UserPlus,
          href: '/onboarding',
          permission: 'people:onboard:manage',
        },
        {
          label: 'Offboarding',
          icon: UserMinus,
          href: '/offboarding',
          permission: 'people:offboard:manage',
        },
        {
          label: 'Change Requests',
          icon: FileCheck,
          href: '/change-requests',
          permission: 'people:changes:review',
        },
      ],
    },
    {
      label: 'Analytics',
      items: [
        {
          label: 'Reports',
          icon: BarChart3,
          href: '/reports',
          permission: 'people:reports:read',
        },
      ],
    },
    {
      label: 'Configuration',
      items: [
        {
          label: 'Settings',
          icon: Settings,
          href: '/settings',
          permission: 'people:settings:manage',
        },
      ],
    },
  ],
}
```

- [ ] **1.2** Verify `NavigationConfig` type from `@future/app-layout` supports the `permission` field being optional (for My Profile which requires only authentication).
- [ ] **1.3** Write a smoke test that the nav config has no duplicate `href` values.

---

## Task 2 — Shared types

- [ ] **2.1** Create `apps/web-people/src/lib/types.ts` with all shared frontend types matching the new data model:

```typescript
// apps/web-people/src/lib/types.ts

// --- Directory row (P1) ---
export type DirectoryRow = {
  id: string // employment.id
  personProfileId: string
  avatarUrl: string | null
  fullName: string
  preferredName: string | null
  jobTitle: string // from job_profile via job_assignment
  jobLevel: string | null
  department: string
  departmentId: string
  location: string | null
  countryCode: string
  companyEmail: string | null
  employmentStatus: EmploymentStatus
  employmentType: EmploymentType
  workerType: WorkerType
  workArrangement: WorkArrangement | null
  managerId: string | null
  managerName: string | null
  hireDate: string
}

export type EmploymentStatus =
  | 'pre_hire'
  | 'active'
  | 'on_leave'
  | 'suspended'
  | 'notice_period'
  | 'terminated'

export type EmploymentType = 'permanent' | 'fixed_term' | 'intern'

export type WorkerType = 'employee' | 'contingent'

export type WorkArrangement = 'on_site' | 'remote' | 'hybrid'

// --- Profile (P3/P4) ---
export type EmployeeProfile = {
  personProfile: PersonProfile
  employment: Employment
  currentJob: CurrentJobAssignment | null
  emergencyContacts: EmergencyContact[]
  addresses: Address[]
  countryFields: CountryFieldValue[]
  customFields: CustomFieldValue[]
  bankDetails: BankDetails | null
  probation: ProbationRecord | null
  completenessScore: number
  completenessMissing: string[]
}

export type PersonProfile = {
  id: string
  actorId: string
  familyName: string
  givenName: string
  middleName: string | null
  fullName: string
  preferredName: string | null
  nameDisplayOrder: 'family_first' | 'given_first'
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  maritalStatus: string | null
  photoUrl: string | null
}

export type Employment = {
  id: string
  employeeCode: string | null
  companyEmail: string | null
  workerType: WorkerType
  employmentType: EmploymentType
  countryCode: string
  employmentStatus: EmploymentStatus
  hireDate: string
  terminationDate: string | null
  terminationReason: string | null
  workArrangement: WorkArrangement | null
}

export type CurrentJobAssignment = {
  id: string
  jobProfileId: string
  jobTitle: string
  jobLevel: string | null
  jobFamilyName: string
  departmentId: string
  departmentName: string
  locationId: string | null
  locationName: string | null
  costCenter: string | null
  managerId: string | null
  managerName: string | null
  effectiveDate: string
}

export type EmergencyContact = {
  id: string
  name: string
  relationship: string
  phone: string
  email: string | null
}

export type Address = {
  id: string
  type: 'permanent' | 'current'
  line1: string
  line2: string | null
  city: string
  state: string | null
  postalCode: string | null
  country: string
}

export type CountryFieldValue = {
  fieldKey: string
  label: string
  group: string
  type: string
  value: unknown
}

export type CustomFieldValue = {
  fieldKey: string
  label: string
  group: string
  type: string
  value: unknown
}

export type BankDetails = {
  accountNumber: string // masked unless revealed
  bankName: string | null
  branchName: string | null
  holderName: string | null
  swiftCode: string | null
}

export type ProbationRecord = {
  id: string
  status: 'in_progress' | 'passed' | 'failed' | 'extended'
  startDate: string
  endDate: string
  originalEndDate: string
  extensions: ProbationExtension[]
  salaryPercentage: number | null
  outcome: string | null
  outcomeDate: string | null
}

export type ProbationExtension = {
  extendedDate: string
  reason: string
  extendedBy: string
}

// --- Job History (Tab 2) ---
export type JobHistoryEntry = {
  id: string
  eventType: 'hire' | 'promotion' | 'lateral' | 'demotion' | 'reorg' | 'termination'
  effectiveDate: string
  jobTitle: string
  department: string
  manager: string | null
  reason: string | null
  isCurrent: boolean
  isFuture: boolean
  before: Record<string, string> | null
  after: Record<string, string> | null
}

// --- Documents (Tab 3) ---
export type EmployeeDocument = {
  id: string
  title: string
  category: string
  uploadDate: string
  expiryDate: string | null
  status: 'valid' | 'expiring_soon' | 'expired' | 'pending_review'
  isConfidential: boolean
  documentId: string // reference to documents module
}

export type DocumentRequirement = {
  category: string
  title: string
  required: boolean
  deadlineDays: number | null
  submitted: boolean
  documentId: string | null
}

// --- Contracts (Tab 4) ---
export type ContractVersion = {
  id: string
  contractType: 'indefinite' | 'fixed_term' | 'probation'
  status: 'active' | 'expired' | 'superseded' | 'draft'
  startDate: string
  endDate: string | null
  baseSalary: number | null // confidential
  currency: string | null
  signedDate: string | null
  documentId: string | null
}

// --- Profile Sections (Tab 5) ---
export type ProfileSection = {
  id: string
  sectionType:
    | 'education'
    | 'work_experience'
    | 'certification'
    | 'skill'
    | 'language'
    | 'social_link'
    | 'dependent'
  data: Record<string, unknown>
  sortOrder: number
}

// --- Change Requests (Tab 6) ---
export type ChangeRequest = {
  id: string
  fieldPath: string
  fieldLabel: string
  oldValue: string
  newValue: string
  requestedBy: string
  requestedByName: string
  requestedAt: string
  effectiveDate: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

// --- Org Chart (P2) ---
export type OrgChartNode = {
  employmentId: string
  personProfileId: string
  fullName: string
  avatarUrl: string | null
  jobTitle: string
  department: string
  directReportCount: number
  managerId: string | null
  children?: OrgChartNode[]
}
```

---

## Task 3 — StatusBadge component

- [ ] **3.1** Create `apps/web-people/src/components/status-badge.tsx`:

```tsx
// apps/web-people/src/components/status-badge.tsx
'use client'

import { Badge } from '@future/ui'
import type { EmploymentStatus } from '../lib/types'

const statusConfig: Record<
  EmploymentStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  active: { label: 'Active', variant: 'default' },
  pre_hire: { label: 'Pre-hire', variant: 'secondary' },
  on_leave: { label: 'On Leave', variant: 'outline' },
  suspended: { label: 'Suspended', variant: 'secondary' },
  notice_period: { label: 'Notice Period', variant: 'outline' },
  terminated: { label: 'Terminated', variant: 'destructive' },
}

interface StatusBadgeProps {
  status: EmploymentStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}
```

- [ ] **3.2** Write `status-badge.spec.tsx` — renders correct label and variant for each status.

---

## Task 4 — AvatarNameCell component

- [ ] **4.1** Create `apps/web-people/src/components/avatar-name-cell.tsx` for DataTable name column:

```tsx
// apps/web-people/src/components/avatar-name-cell.tsx
'use client'

import { Avatar } from '@future/ui'

interface AvatarNameCellProps {
  fullName: string
  preferredName?: string | null
  avatarUrl?: string | null
  subtitle?: string | null
}

export function AvatarNameCell({
  fullName,
  preferredName,
  avatarUrl,
  subtitle,
}: AvatarNameCellProps) {
  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={fullName} className="h-full w-full rounded-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-xs font-[510] text-[#d0d6e0]">
            {initials}
          </div>
        )}
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-[510] text-[#f7f8f8]">
          {fullName}
          {preferredName && (
            <span className="ml-1 text-[#8a8f98] font-normal">({preferredName})</span>
          )}
        </div>
        {subtitle && <div className="truncate text-xs text-[#8a8f98]">{subtitle}</div>}
      </div>
    </div>
  )
}
```

---

## Task 5 — FieldRenderer component

- [ ] **5.1** Create `apps/web-people/src/components/field-renderer.tsx` for dynamic field rendering from country_field_config and custom_field_definition:

```tsx
// apps/web-people/src/components/field-renderer.tsx
'use client'

import { Badge, Input, Checkbox } from '@future/ui'

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select' | 'textarea'

interface FieldRendererProps {
  label: string
  value: unknown
  type: FieldType
  editable?: boolean
  onChange?: (value: unknown) => void
}

export function FieldRenderer({
  label,
  value,
  type,
  editable = false,
  onChange,
}: FieldRendererProps) {
  if (!editable) {
    return (
      <div className="space-y-1">
        <dt className="text-xs font-[510] text-[#8a8f98] uppercase tracking-wide">{label}</dt>
        <dd className="text-sm text-[#d0d6e0]">{renderReadOnlyValue(value, type)}</dd>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-[510] text-[#8a8f98] uppercase tracking-wide">{label}</label>
      {renderEditableField(value, type, onChange)}
    </div>
  )
}

function renderReadOnlyValue(value: unknown, type: FieldType): React.ReactNode {
  if (value == null || value === '') return <span className="text-[#62666d]">--</span>

  switch (type) {
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'date':
      return new Date(String(value)).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    case 'multi_select':
      return (
        <div className="flex flex-wrap gap-1">
          {(value as string[]).map((v) => (
            <Badge key={v} variant="secondary">
              {v}
            </Badge>
          ))}
        </div>
      )
    default:
      return String(value)
  }
}

function renderEditableField(
  value: unknown,
  type: FieldType,
  onChange?: (value: unknown) => void,
): React.ReactNode {
  switch (type) {
    case 'boolean':
      return (
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange?.(checked)} />
      )
    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-sm text-[#d0d6e0]"
          rows={3}
        />
      )
    default:
      return (
        <Input
          type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )
  }
}

// Grouped field renderer for country/custom field sections
interface FieldGroupRendererProps {
  fields: Array<{ fieldKey: string; label: string; group: string; type: string; value: unknown }>
  editable?: boolean
  onFieldChange?: (fieldKey: string, value: unknown) => void
}

export function FieldGroupRenderer({
  fields,
  editable = false,
  onFieldChange,
}: FieldGroupRendererProps) {
  const groups = fields.reduce<Record<string, typeof fields>>((acc, field) => {
    const group = field.group || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(field)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([groupName, groupFields]) => (
        <div key={groupName}>
          <h4 className="text-sm font-[590] text-[#f7f8f8] mb-3">{groupName}</h4>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groupFields.map((field) => (
              <FieldRenderer
                key={field.fieldKey}
                label={field.label}
                value={field.value}
                type={field.type as FieldType}
                editable={editable}
                onChange={onFieldChange ? (val) => onFieldChange(field.fieldKey, val) : undefined}
              />
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **5.2** Write `field-renderer.spec.tsx` — renders text, date, boolean, multi_select correctly; handles null/empty values.

---

## Task 6 — TimelineEntry component

- [ ] **6.1** Create `apps/web-people/src/components/timeline-entry.tsx`:

```tsx
// apps/web-people/src/components/timeline-entry.tsx
'use client'

import * as React from 'react'
import { Badge, Separator } from '@future/ui'
import { ChevronDown, ChevronRight } from 'lucide-react'

const eventTypeConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  hire: { label: 'Hired', variant: 'default' },
  promotion: { label: 'Promotion', variant: 'default' },
  lateral: { label: 'Lateral Move', variant: 'secondary' },
  demotion: { label: 'Demotion', variant: 'outline' },
  reorg: { label: 'Reorganization', variant: 'secondary' },
  termination: { label: 'Termination', variant: 'destructive' },
}

interface TimelineEntryProps {
  eventType: string
  effectiveDate: string
  title: string
  subtitle?: string | null
  reason?: string | null
  isCurrent?: boolean
  isFuture?: boolean
  before?: Record<string, string> | null
  after?: Record<string, string> | null
}

export function TimelineEntry({
  eventType,
  effectiveDate,
  title,
  subtitle,
  reason,
  isCurrent = false,
  isFuture = false,
  before,
  after,
}: TimelineEntryProps) {
  const [expanded, setExpanded] = React.useState(false)
  const config = eventTypeConfig[eventType] ?? { label: eventType, variant: 'secondary' as const }
  const hasDiff = before != null && after != null

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 ${
          isCurrent
            ? 'border-[#7170ff] bg-[#5e6ad2]'
            : isFuture
              ? 'border-dashed border-[#8a8f98] bg-transparent'
              : 'border-[#34343a] bg-[#191a1b]'
        }`}
      />
      {/* Timeline line */}
      <div className="absolute left-[5px] top-5 bottom-0 w-px bg-[rgba(255,255,255,0.05)]" />

      <div
        className={`rounded-lg border p-4 ${
          isCurrent
            ? 'border-[#7170ff]/30 bg-[rgba(113,112,255,0.04)]'
            : isFuture
              ? 'border-dashed border-[rgba(255,255,255,0.08)] bg-transparent'
              : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={config.variant}>{config.label}</Badge>
              {isFuture && <Badge variant="outline">Scheduled</Badge>}
              <span className="text-xs text-[#8a8f98]">
                {new Date(effectiveDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="text-sm font-[510] text-[#f7f8f8]">{title}</div>
            {subtitle && <div className="text-xs text-[#8a8f98]">{subtitle}</div>}
            {reason && <div className="text-xs text-[#62666d]">Reason: {reason}</div>}
          </div>

          {hasDiff && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 rounded p-1 hover:bg-[rgba(255,255,255,0.05)]"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-[#8a8f98]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#8a8f98]" />
              )}
            </button>
          )}
        </div>

        {expanded && hasDiff && (
          <>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="mb-1 font-[510] text-[#8a8f98]">Before</div>
                {Object.entries(before!).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-[#62666d]">{key}</span>
                    <span className="text-[#d0d6e0]">{val}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 font-[510] text-[#8a8f98]">After</div>
                {Object.entries(after!).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-[#62666d]">{key}</span>
                    <span className="text-[#f7f8f8] font-[510]">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

---

## Task 7 — CompletenessBar component

- [ ] **7.1** Create `apps/web-people/src/components/completeness-bar.tsx`:

```tsx
// apps/web-people/src/components/completeness-bar.tsx
'use client'

import { Progress } from '@future/ui'

interface CompletenessBarProps {
  score: number // 0-100
  missingItems?: string[]
  showLink?: boolean
  onCompleteClick?: () => void
}

export function CompletenessBar({
  score,
  missingItems,
  showLink,
  onCompleteClick,
}: CompletenessBarProps) {
  const color = score >= 80 ? 'text-[#10b981]' : score >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#8a8f98]">Profile completeness</span>
        <span className={`font-[510] ${color}`}>{score}%</span>
      </div>
      <Progress value={score} className="h-1.5" />
      {showLink && score < 100 && missingItems && missingItems.length > 0 && (
        <button
          type="button"
          onClick={onCompleteClick}
          className="text-xs text-[#7170ff] hover:text-[#828fff] underline-offset-2 hover:underline"
        >
          Complete your profile ({missingItems.length} items remaining)
        </button>
      )}
    </div>
  )
}
```

---

## Task 8 — EmployeeCard component (P1 card view)

- [ ] **8.1** Create `apps/web-people/src/components/employee-card.tsx`:

```tsx
// apps/web-people/src/components/employee-card.tsx
'use client'

import { Card } from '@future/ui'
import { MapPin, Building2 } from 'lucide-react'
import { StatusBadge } from './status-badge'
import type { DirectoryRow } from '../lib/types'

interface EmployeeCardProps {
  employee: DirectoryRow
  onClick: (employmentId: string) => void
}

export function EmployeeCard({ employee, onClick }: EmployeeCardProps) {
  const initials = employee.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card
      className="cursor-pointer border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
      onClick={() => onClick(employee.id)}
    >
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-lg font-[510] text-[#d0d6e0]">
          {employee.avatarUrl ? (
            <img
              src={employee.avatarUrl}
              alt={employee.fullName}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Name + Title */}
        <div className="mb-1 text-sm font-[510] text-[#f7f8f8] truncate max-w-full">
          {employee.fullName}
        </div>
        <div className="mb-3 text-xs text-[#8a8f98] truncate max-w-full">{employee.jobTitle}</div>

        {/* Department + Location */}
        <div className="flex flex-col gap-1 text-xs text-[#62666d] w-full">
          <div className="flex items-center justify-center gap-1 truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{employee.department}</span>
          </div>
          {employee.location && (
            <div className="flex items-center justify-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{employee.location}</span>
            </div>
          )}
        </div>

        {/* Status + Work Arrangement */}
        <div className="mt-3 flex items-center gap-2">
          <StatusBadge status={employee.employmentStatus} />
          {employee.workArrangement && (
            <span className="rounded-full border border-[#23252a] px-2 py-0.5 text-[10px] font-[510] text-[#d0d6e0]">
              {employee.workArrangement.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **8.2** Write `employee-card.spec.tsx` — renders name, title, department; calls onClick with correct employmentId; handles missing avatar gracefully.

---

## Task 9 — FilterPanel component (P1)

- [ ] **9.1** Create `apps/web-people/src/components/filter-panel.tsx`:

```tsx
// apps/web-people/src/components/filter-panel.tsx
'use client'

import * as React from 'react'
import {
  Button,
  Badge,
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Input,
} from '@future/ui'
import { Filter, X, ChevronDown } from 'lucide-react'
import type { EmploymentStatus, EmploymentType, WorkerType, WorkArrangement } from '../lib/types'

export type FilterValues = {
  departmentIds: string[]
  jobFamilyIds: string[]
  jobProfileIds: string[]
  employmentStatus: EmploymentStatus[]
  employmentType: EmploymentType[]
  workerType: WorkerType[]
  workArrangement: WorkArrangement[]
  countryCode: string[]
  location: string[]
  hireDateFrom: string | null
  hireDateTo: string | null
  managerId: string | null
}

export const emptyFilters: FilterValues = {
  departmentIds: [],
  jobFamilyIds: [],
  jobProfileIds: [],
  employmentStatus: [],
  employmentType: [],
  workerType: [],
  workArrangement: [],
  countryCode: [],
  location: [],
  hireDateFrom: null,
  hireDateTo: null,
  managerId: null,
}

interface FilterOption {
  value: string
  label: string
  count?: number
}

interface FilterPanelProps {
  filters: FilterValues
  onFiltersChange: (filters: FilterValues) => void
  departments: FilterOption[]
  jobFamilies: FilterOption[]
  countries: FilterOption[]
  locations: FilterOption[]
}

export function FilterPanel({
  filters,
  onFiltersChange,
  departments,
  jobFamilies,
  countries,
  locations,
}: FilterPanelProps) {
  const activeCount = countActiveFilters(filters)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Main filter button */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {activeCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            <FilterSection
              title="Department"
              options={departments}
              selected={filters.departmentIds}
              onChange={(val) => onFiltersChange({ ...filters, departmentIds: val })}
            />
            <Separator />
            <FilterSection
              title="Job Family"
              options={jobFamilies}
              selected={filters.jobFamilyIds}
              onChange={(val) => onFiltersChange({ ...filters, jobFamilyIds: val })}
            />
            <Separator />
            <FilterSection
              title="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'pre_hire', label: 'Pre-hire' },
                { value: 'on_leave', label: 'On Leave' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'notice_period', label: 'Notice Period' },
                { value: 'terminated', label: 'Terminated' },
              ]}
              selected={filters.employmentStatus}
              onChange={(val) =>
                onFiltersChange({ ...filters, employmentStatus: val as EmploymentStatus[] })
              }
            />
            <Separator />
            <FilterSection
              title="Country"
              options={countries}
              selected={filters.countryCode}
              onChange={(val) => onFiltersChange({ ...filters, countryCode: val })}
            />
            <Separator />
            <FilterSection
              title="Employment Type"
              options={[
                { value: 'permanent', label: 'Permanent' },
                { value: 'fixed_term', label: 'Fixed Term' },
                { value: 'intern', label: 'Intern' },
              ]}
              selected={filters.employmentType}
              onChange={(val) =>
                onFiltersChange({ ...filters, employmentType: val as EmploymentType[] })
              }
            />
            <Separator />
            <FilterSection
              title="Location"
              options={locations}
              selected={filters.location}
              onChange={(val) => onFiltersChange({ ...filters, location: val })}
            />
            <Separator />
            <div>
              <div className="text-xs font-[510] text-[#8a8f98] mb-2">Hire Date</div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={filters.hireDateFrom ?? ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, hireDateFrom: e.target.value || null })
                  }
                  placeholder="From"
                  className="text-xs"
                />
                <Input
                  type="date"
                  value={filters.hireDateTo ?? ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, hireDateTo: e.target.value || null })
                  }
                  placeholder="To"
                  className="text-xs"
                />
              </div>
            </div>
          </div>
          {activeCount > 0 && (
            <div className="border-t border-[rgba(255,255,255,0.05)] p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => onFiltersChange(emptyFilters)}
              >
                <X className="mr-1 h-3 w-3" />
                Clear all filters
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Active filter pills */}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange(emptyFilters)}
          className="text-xs text-[#8a8f98]"
        >
          Clear all
        </Button>
      )}
    </div>
  )
}

// Filter section with checkbox list and search
function FilterSection({
  title,
  options,
  selected,
  onChange,
}: {
  title: string
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const [search, setSearch] = React.useState('')
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-[510] text-[#8a8f98]">{title}</span>
        {selected.length > 0 && (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {selected.length}
          </Badge>
        )}
      </div>
      {options.length > 5 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="mb-2 h-7 text-xs"
        />
      )}
      <div className="max-h-32 space-y-1 overflow-y-auto">
        {filtered.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[rgba(255,255,255,0.04)] cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onChange([...selected, option.value])
                } else {
                  onChange(selected.filter((v) => v !== option.value))
                }
              }}
              className="h-3.5 w-3.5"
            />
            <span className="text-[#d0d6e0] flex-1">{option.label}</span>
            {option.count != null && <span className="text-[#62666d]">{option.count}</span>}
          </label>
        ))}
      </div>
    </div>
  )
}

function countActiveFilters(filters: FilterValues): number {
  let count = 0
  if (filters.departmentIds.length > 0) count++
  if (filters.jobFamilyIds.length > 0) count++
  if (filters.jobProfileIds.length > 0) count++
  if (filters.employmentStatus.length > 0) count++
  if (filters.employmentType.length > 0) count++
  if (filters.workerType.length > 0) count++
  if (filters.workArrangement.length > 0) count++
  if (filters.countryCode.length > 0) count++
  if (filters.location.length > 0) count++
  if (filters.hireDateFrom) count++
  if (filters.hireDateTo) count++
  if (filters.managerId) count++
  return count
}
```

---

## Task 10 — CardGridView component (P1)

- [ ] **10.1** Create `apps/web-people/src/components/card-grid-view.tsx`:

```tsx
// apps/web-people/src/components/card-grid-view.tsx
'use client'

import { useRouter } from 'next/navigation'
import { EmployeeCard } from './employee-card'
import type { DirectoryRow } from '../lib/types'

interface CardGridViewProps {
  employees: DirectoryRow[]
}

export function CardGridView({ employees }: CardGridViewProps) {
  const router = useRouter()

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-sm text-[#8a8f98]">No employees match your filters</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {employees.map((employee) => (
        <EmployeeCard
          key={employee.id}
          employee={employee}
          onClick={(id) => router.push(`/profile/${id}`)}
        />
      ))}
    </div>
  )
}
```

---

## Task 11 — Rewrite PeopleDirectoryTable (P1)

- [ ] **11.1** Rewrite `apps/web-people/src/components/people-directory-table.tsx` with new columns matching the new data model:

```tsx
// apps/web-people/src/components/people-directory-table.tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  type FutureTableState,
  type PersistedSavedViewState,
  defaultTableState,
  isSavedViewDirty,
  Button,
  Badge,
} from '@future/ui'
import { LayoutGrid, LayoutList, Download } from 'lucide-react'
import { trpc } from '../lib/trpc'
import {
  getTableStateFromUrl,
  pushTableStateToUrl,
  replaceTableStateInUrl,
  resolveHydratedTableState,
} from '../lib/table-url-state'
import { AvatarNameCell } from './avatar-name-cell'
import { StatusBadge } from './status-badge'
import { FilterPanel, emptyFilters, type FilterValues } from './filter-panel'
import { CardGridView } from './card-grid-view'
import type { DirectoryRow, EmploymentStatus } from '../lib/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<DirectoryRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        className="h-3.5 w-3.5"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        className="h-3.5 w-3.5"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'fullName',
    header: 'Name',
    enableSorting: true,
    cell: ({ row }: CellContext<DirectoryRow, unknown>) => (
      <AvatarNameCell
        fullName={row.original.fullName}
        preferredName={row.original.preferredName}
        avatarUrl={row.original.avatarUrl}
        subtitle={row.original.companyEmail}
      />
    ),
  },
  {
    accessorKey: 'jobTitle',
    header: 'Job Title',
    enableSorting: true,
  },
  {
    accessorKey: 'department',
    header: 'Department',
    enableSorting: true,
  },
  {
    accessorKey: 'location',
    header: 'Location',
    enableSorting: true,
    cell: ({ getValue }: CellContext<DirectoryRow, unknown>) => {
      const val = getValue() as string | null
      return val ?? <span className="text-[#62666d]">--</span>
    },
  },
  {
    accessorKey: 'employmentStatus',
    header: 'Status',
    enableSorting: true,
    cell: ({ getValue }: CellContext<DirectoryRow, unknown>) => (
      <StatusBadge status={getValue() as EmploymentStatus} />
    ),
  },
  {
    accessorKey: 'countryCode',
    header: 'Country',
    enableSorting: true,
    cell: ({ getValue }: CellContext<DirectoryRow, unknown>) => {
      const code = getValue() as string
      return <span className="text-xs text-[#d0d6e0]">{code.toUpperCase()}</span>
    },
  },
]

type ViewMode = 'list' | 'card'

export interface PeopleDirectoryTableProps {
  resourceKey: string
}

export function PeopleDirectoryTable({ resourceKey }: PeopleDirectoryTableProps) {
  const router = useRouter()
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [viewMode, setViewMode] = React.useState<ViewMode>('list')
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null)
  const [viewsData, setViewsData] = React.useState<{
    views: Array<{
      id: string
      name: string
      isDefault: boolean
      stateJson: PersistedSavedViewState
    }>
    activeView: { id: string; stateJson: PersistedSavedViewState } | null
    defaultViewId: string | null
  }>({ views: [], activeView: null, defaultViewId: null })
  const [rows, setRows] = React.useState<DirectoryRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | undefined>()
  const [isViewsLoading, setIsViewsLoading] = React.useState(true)

  // Filter facet data
  const [facets, setFacets] = React.useState<{
    departments: Array<{ value: string; label: string; count?: number }>
    jobFamilies: Array<{ value: string; label: string; count?: number }>
    countries: Array<{ value: string; label: string; count?: number }>
    locations: Array<{ value: string; label: string; count?: number }>
  }>({ departments: [], jobFamilies: [], countries: [], locations: [] })

  const [filterValues, setFilterValues] = React.useState<FilterValues>(emptyFilters)

  // On mount: resolve saved view state
  React.useEffect(() => {
    const urlState = getTableStateFromUrl()
    const requestedActiveViewId =
      new URLSearchParams(window.location.search).get('activeViewId') ?? null

    // Read view mode from URL
    const urlViewMode = new URLSearchParams(window.location.search).get('view')
    if (urlViewMode === 'card' || urlViewMode === 'list') setViewMode(urlViewMode)

    void (
      anyTrpc.preferences.savedView.resolve.query({
        resourceKey,
        activeViewId: requestedActiveViewId,
      }) as Promise<typeof viewsData>
    )
      .then((result) => {
        const activeView = result.activeView?.stateJson ?? null
        const defaultViewEntry = result.defaultViewId
          ? result.views.find((v) => v.id === result.defaultViewId)
          : null
        const defaultView = defaultViewEntry?.stateJson ?? null

        const { nextState, nextActiveViewId, replaceUrl } = resolveHydratedTableState({
          urlState,
          activeView,
          defaultView,
          requestedActiveViewId,
        })

        setViewsData(result)
        setActiveViewId(nextActiveViewId)
        setTableState(nextState)
        if (replaceUrl) replaceTableStateInUrl(nextState, nextActiveViewId)
      })
      .catch(() => setTableState(urlState))
      .finally(() => setIsViewsLoading(false))
  }, [resourceKey])

  // Load data + facets
  React.useEffect(() => {
    if (isViewsLoading) return
    void (async () => {
      setIsLoading(true)
      setError(undefined)
      try {
        const result = await (anyTrpc.people.directory.list.query({
          resourceKey,
          search: tableState.search,
          filters: {
            ...tableState.filters,
            ...filterValues,
          },
          sorting: tableState.sorting,
          pagination: tableState.pagination,
        }) as Promise<{
          rows: DirectoryRow[]
          totalCount: number
          facets: typeof facets
        }>)
        setRows(result.rows)
        setTotalCount(result.totalCount)
        if (result.facets) setFacets(result.facets)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState, filterValues, resourceKey, isViewsLoading])

  function handleStateChange(next: FutureTableState) {
    setTableState(next)
    pushTableStateToUrl(next)
  }

  function handleRowClick(row: DirectoryRow) {
    router.push(`/profile/${row.id}`)
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const result = await (anyTrpc.people.directory.export.query({
        resourceKey,
        search: tableState.search,
        filters: { ...tableState.filters, ...filterValues },
        sorting: tableState.sorting,
        format,
      }) as Promise<{ filename: string; csv: string }>)
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filters + view toggle + export */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <FilterPanel
            filters={filterValues}
            onFiltersChange={setFilterValues}
            departments={facets.departments}
            jobFamilies={facets.jobFamilies}
            countries={facets.countries}
            locations={facets.locations}
          />
          {totalCount > 0 && <span className="text-xs text-[#62666d]">{totalCount} employees</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-l-md p-1.5 ${
                viewMode === 'list'
                  ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8]'
                  : 'text-[#62666d] hover:text-[#8a8f98]'
              }`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`rounded-r-md p-1.5 ${
                viewMode === 'card'
                  ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8]'
                  : 'text-[#62666d] hover:text-[#8a8f98]'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport('csv')}
            className="gap-1"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <DataTable
          columns={columns}
          rows={rows}
          state={tableState}
          totalCount={totalCount}
          onStateChange={handleStateChange}
          onRowClick={handleRowClick}
          onExport={() => void handleExport('csv')}
          isLoading={isLoading}
          error={error}
          onRetry={() => setTableState({ ...tableState })}
        />
      ) : (
        <CardGridView employees={rows} />
      )}
    </div>
  )
}
```

- [ ] **11.2** Update `apps/web-people/src/app/page.tsx` to add breadcrumbs:

```tsx
// apps/web-people/src/app/page.tsx
import { Breadcrumb } from '@future/ui'
import { PeopleDirectoryTable } from '../components/people-directory-table'

export default function DirectoryPage() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">People Directory</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">
          Browse and manage all employees across the organization.
        </p>
      </div>
      <PeopleDirectoryTable resourceKey="people.directory" />
    </main>
  )
}
```

- [ ] **11.3** Write `people-directory-table.spec.tsx` — tests that columns render correctly, view toggle works, filter panel opens.

---

## Task 12 — Org Chart page (P2)

- [ ] **12.1** Create `apps/web-people/src/components/org-chart-node.tsx`:

```tsx
// apps/web-people/src/components/org-chart-node.tsx
'use client'

import * as React from 'react'
import { Card, Badge, HoverCard, HoverCardContent, HoverCardTrigger } from '@future/ui'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'
import type { OrgChartNode as OrgChartNodeType } from '../lib/types'

interface OrgChartNodeProps {
  node: OrgChartNodeType
  isHighlighted?: boolean
  onToggle: (employmentId: string) => void
  onNavigate: (employmentId: string) => void
  expandedIds: Set<string>
}

export function OrgChartNodeComponent({
  node,
  isHighlighted = false,
  onToggle,
  onNavigate,
  expandedIds,
}: OrgChartNodeProps) {
  const isExpanded = expandedIds.has(node.employmentId)
  const hasChildren = node.directReportCount > 0

  const initials = node.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col items-center">
      <HoverCard>
        <HoverCardTrigger asChild>
          <Card
            className={`w-56 cursor-pointer border p-3 transition-all ${
              isHighlighted
                ? 'border-[#7170ff] ring-2 ring-[#7170ff]/20'
                : 'border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]'
            } bg-[rgba(255,255,255,0.02)]`}
            onClick={() => hasChildren && onToggle(node.employmentId)}
            onDoubleClick={() => onNavigate(node.employmentId)}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-sm font-[510] text-[#d0d6e0]">
                {node.avatarUrl ? (
                  <img
                    src={node.avatarUrl}
                    alt={node.fullName}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-[510] text-[#f7f8f8]">{node.fullName}</div>
                <div className="truncate text-xs text-[#8a8f98]">{node.jobTitle}</div>
                <div className="truncate text-xs text-[#62666d]">{node.department}</div>
              </div>
              {hasChildren && (
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    <Users className="mr-0.5 h-2.5 w-2.5" />
                    {node.directReportCount}
                  </Badge>
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-[#8a8f98]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-[#8a8f98]" />
                  )}
                </div>
              )}
            </div>
          </Card>
        </HoverCardTrigger>
        <HoverCardContent className="w-64">
          <div className="space-y-2 text-sm">
            <div className="font-[510] text-[#f7f8f8]">{node.fullName}</div>
            <div className="text-xs text-[#8a8f98]">{node.jobTitle}</div>
            <div className="text-xs text-[#62666d]">{node.department}</div>
            <div className="text-xs text-[#62666d]">{node.directReportCount} direct reports</div>
            <button
              type="button"
              onClick={() => onNavigate(node.employmentId)}
              className="text-xs text-[#7170ff] hover:text-[#828fff]"
            >
              View Profile
            </button>
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* Children */}
      {isExpanded && node.children && node.children.length > 0 && (
        <div className="mt-4">
          {/* Connector line */}
          <div className="mx-auto h-4 w-px bg-[rgba(255,255,255,0.1)]" />
          {/* Horizontal connector bar */}
          {node.children.length > 1 && (
            <div
              className="mx-auto h-px bg-[rgba(255,255,255,0.1)]"
              style={{ width: `${(node.children.length - 1) * 240}px` }}
            />
          )}
          <div className="flex gap-6 justify-center">
            {node.children.map((child) => (
              <div key={child.employmentId} className="flex flex-col items-center">
                <div className="h-4 w-px bg-[rgba(255,255,255,0.1)]" />
                <OrgChartNodeComponent
                  node={child}
                  isHighlighted={false}
                  onToggle={onToggle}
                  onNavigate={onNavigate}
                  expandedIds={expandedIds}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **12.2** Create `apps/web-people/src/components/org-chart-tree.tsx` (container that manages expand/collapse state and search):

```tsx
// apps/web-people/src/components/org-chart-tree.tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Input, Button, ToggleGroup, ToggleGroupItem } from '@future/ui'
import { Search, Minus, Plus, Maximize2 } from 'lucide-react'
import { OrgChartNodeComponent } from './org-chart-node'
import type { OrgChartNode } from '../lib/types'
import { trpc } from '../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type ViewMode = 'manager' | 'department'

export function OrgChartTree() {
  const router = useRouter()
  const [viewMode, setViewMode] = React.useState<ViewMode>('manager')
  const [search, setSearch] = React.useState('')
  const [tree, setTree] = React.useState<OrgChartNode[]>([])
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [zoom, setZoom] = React.useState(1)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.orgChart.tree.query({
          viewMode,
        }) as Promise<{ nodes: OrgChartNode[] }>)
        setTree(result.nodes)
        // Auto-expand first level
        const firstLevelIds = new Set(result.nodes.map((n) => n.employmentId))
        setExpandedIds(firstLevelIds)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [viewMode])

  function handleToggle(employmentId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(employmentId)) next.delete(employmentId)
      else next.add(employmentId)
      return next
    })
  }

  function handleExpandAll() {
    const allIds = new Set<string>()
    function collectIds(nodes: OrgChartNode[]) {
      for (const n of nodes) {
        allIds.add(n.employmentId)
        if (n.children) collectIds(n.children)
      }
    }
    collectIds(tree)
    setExpandedIds(allIds)
  }

  function handleCollapseAll() {
    setExpandedIds(new Set())
  }

  function handleSearch() {
    if (!search.trim()) {
      setHighlightedId(null)
      return
    }
    const found = findNode(tree, search.toLowerCase())
    if (found) {
      setHighlightedId(found.employmentId)
      // Expand ancestors
      const ancestorIds = getAncestorIds(tree, found.employmentId)
      setExpandedIds((prev) => new Set([...prev, ...ancestorIds]))
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#62666d]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Find person..."
              className="h-8 w-64 pl-8 text-xs"
            />
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as ViewMode)}
          >
            <ToggleGroupItem value="manager" className="text-xs h-8">
              By Manager
            </ToggleGroupItem>
            <ToggleGroupItem value="department" className="text-xs h-8">
              By Department
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-xs text-[#8a8f98]">{Math.round(zoom * 100)}%</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExpandAll} className="text-xs">
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={handleCollapseAll} className="text-xs">
            Collapse All
          </Button>
        </div>
      </div>

      {/* Tree canvas */}
      <div className="overflow-auto rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.01)] p-8 min-h-[500px]">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#8a8f98]">
              Loading org chart...
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {tree.map((node) => (
                <OrgChartNodeComponent
                  key={node.employmentId}
                  node={node}
                  isHighlighted={highlightedId === node.employmentId}
                  onToggle={handleToggle}
                  onNavigate={(id) => router.push(`/profile/${id}`)}
                  expandedIds={expandedIds}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Utility: find a node by name
function findNode(nodes: OrgChartNode[], searchLower: string): OrgChartNode | null {
  for (const n of nodes) {
    if (n.fullName.toLowerCase().includes(searchLower)) return n
    if (n.children) {
      const found = findNode(n.children, searchLower)
      if (found) return found
    }
  }
  return null
}

// Utility: get ancestor IDs for a target node
function getAncestorIds(nodes: OrgChartNode[], targetId: string): string[] {
  const path: string[] = []
  function search(ns: OrgChartNode[]): boolean {
    for (const n of ns) {
      if (n.employmentId === targetId) return true
      if (n.children) {
        path.push(n.employmentId)
        if (search(n.children)) return true
        path.pop()
      }
    }
    return false
  }
  search(nodes)
  return path
}
```

- [ ] **12.3** Create `apps/web-people/src/app/org-chart/page.tsx`:

```tsx
// apps/web-people/src/app/org-chart/page.tsx
import { Breadcrumb } from '@future/ui'
import { OrgChartTree } from '../../components/org-chart-tree'

export default function OrgChartPage() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">
          Organization Chart
        </h1>
        <p className="mt-1 text-sm text-[#8a8f98]">
          Visualize reporting relationships and department structure.
        </p>
      </div>
      <OrgChartTree />
    </main>
  )
}
```

---

## Task 13 — Employee Profile page (P3)

- [ ] **13.1** Create `apps/web-people/src/components/profile/profile-header.tsx`:

```tsx
// apps/web-people/src/components/profile/profile-header.tsx
'use client'

import {
  Avatar,
  Button,
  Badge,
  Alert,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@future/ui'
import { Edit, Share2, MoreHorizontal, Download, Clock, UserMinus } from 'lucide-react'
import { StatusBadge } from '../status-badge'
import { CompletenessBar } from '../completeness-bar'
import type { EmployeeProfile } from '../../lib/types'

interface ProfileHeaderProps {
  profile: EmployeeProfile
  canEdit: boolean
  canManage: boolean
  isSelf: boolean
  onEdit: () => void
  onShare: () => void
  onStartOffboarding?: () => void
}

export function ProfileHeader({
  profile,
  canEdit,
  canManage,
  isSelf,
  onEdit,
  onShare,
  onStartOffboarding,
}: ProfileHeaderProps) {
  const {
    personProfile,
    employment,
    currentJob,
    probation,
    completenessScore,
    completenessMissing,
  } = profile

  const initials = personProfile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-4">
      {/* Probation banner */}
      {probation && probation.status === 'in_progress' && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <Clock className="h-4 w-4 text-amber-400" />
          <div className="text-sm text-amber-200">
            Probation ends in{' '}
            {Math.ceil(
              (new Date(probation.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )}{' '}
            days
            <span className="ml-2 text-xs text-amber-300/60">
              ({new Date(probation.endDate).toLocaleDateString('en-GB')})
            </span>
          </div>
        </Alert>
      )}

      {/* Main header */}
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-2xl font-[510] text-[#d0d6e0]">
            {personProfile.photoUrl ? (
              <img
                src={personProfile.photoUrl}
                alt={personProfile.fullName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          {(isSelf || canEdit) && (
            <button
              type="button"
              className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[#191a1b] text-[#8a8f98] hover:text-[#f7f8f8]"
            >
              <Edit className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">
                {personProfile.fullName}
                {personProfile.preferredName && (
                  <span className="ml-2 text-lg font-normal text-[#8a8f98]">
                    ({personProfile.preferredName})
                  </span>
                )}
              </h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                {currentJob && (
                  <>
                    <span className="text-sm text-[#d0d6e0]">{currentJob.jobTitle}</span>
                    <span className="text-[#62666d]">/</span>
                    <span className="text-sm text-[#8a8f98]">{currentJob.departmentName}</span>
                  </>
                )}
                {currentJob?.locationName && (
                  <>
                    <span className="text-[#62666d]">/</span>
                    <span className="text-sm text-[#8a8f98]">{currentJob.locationName}</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={employment.employmentStatus} />
                {employment.workerType === 'contingent' && (
                  <Badge variant="outline">Contingent</Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <Button variant="default" size="sm" onClick={onEdit} className="gap-1">
                  <Edit className="h-3.5 w-3.5" />
                  Edit Profile
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onShare} className="gap-1">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>
              {canManage && (
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
                    <DropdownMenuItem>
                      <Clock className="mr-2 h-3.5 w-3.5" />
                      View Job History
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
          </div>

          {/* Completeness bar */}
          <div className="mt-4 max-w-md">
            <CompletenessBar
              score={completenessScore}
              missingItems={completenessMissing}
              showLink={isSelf || canEdit}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **13.2** Write `profile-header.spec.tsx` — renders name, title, status badge; shows probation alert when applicable; hides management actions when not permitted.

---

## Task 14 — Profile Tab components (P3)

- [ ] **14.1** Create `apps/web-people/src/components/profile/info-card.tsx` — reusable card for Overview tab sections:

```tsx
// apps/web-people/src/components/profile/info-card.tsx
'use client'

import { Card, Button } from '@future/ui'
import { Edit } from 'lucide-react'

interface InfoCardProps {
  title: string
  children: React.ReactNode
  editable?: boolean
  onEdit?: () => void
}

export function InfoCard({ title, children, editable, onEdit }: InfoCardProps) {
  return (
    <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-[590] text-[#f7f8f8]">{title}</h3>
        {editable && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 gap-1 text-xs">
            <Edit className="h-3 w-3" />
            Edit
          </Button>
        )}
      </div>
      {children}
    </Card>
  )
}
```

- [ ] **14.2** Create `apps/web-people/src/components/profile/tab-overview.tsx`:

```tsx
// apps/web-people/src/components/profile/tab-overview.tsx
'use client'

import { InfoCard } from './info-card'
import { FieldRenderer, FieldGroupRenderer } from '../field-renderer'
import type { EmployeeProfile } from '../../lib/types'

interface TabOverviewProps {
  profile: EmployeeProfile
  canEditPersonal: boolean
  canEditEmployment: boolean
  canEditBank: boolean
}

export function TabOverview({
  profile,
  canEditPersonal,
  canEditEmployment,
  canEditBank,
}: TabOverviewProps) {
  const {
    personProfile,
    employment,
    currentJob,
    emergencyContacts,
    addresses,
    countryFields,
    customFields,
    bankDetails,
  } = profile

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Personal Information */}
      <InfoCard title="Personal Information" editable={canEditPersonal}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FieldRenderer label="Date of Birth" value={personProfile.dateOfBirth} type="date" />
          <FieldRenderer label="Gender" value={personProfile.gender} type="text" />
          <FieldRenderer label="Nationality" value={personProfile.nationality} type="text" />
          <FieldRenderer label="Marital Status" value={personProfile.maritalStatus} type="text" />
        </dl>
      </InfoCard>

      {/* Employment Information */}
      <InfoCard title="Employment Information">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <FieldRenderer label="Employee Code" value={employment.employeeCode} type="text" />
          <FieldRenderer label="Company Email" value={employment.companyEmail} type="text" />
          <FieldRenderer label="Worker Type" value={employment.workerType} type="text" />
          <FieldRenderer label="Employment Type" value={employment.employmentType} type="text" />
          <FieldRenderer label="Work Arrangement" value={employment.workArrangement} type="text" />
          <FieldRenderer label="Hire Date" value={employment.hireDate} type="date" />
          <FieldRenderer label="Country" value={employment.countryCode} type="text" />
        </dl>
      </InfoCard>

      {/* Current Job */}
      {currentJob && (
        <InfoCard title="Current Job">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FieldRenderer label="Job Title" value={currentJob.jobTitle} type="text" />
            <FieldRenderer label="Job Level" value={currentJob.jobLevel} type="text" />
            <FieldRenderer label="Job Family" value={currentJob.jobFamilyName} type="text" />
            <FieldRenderer label="Department" value={currentJob.departmentName} type="text" />
            <FieldRenderer label="Location" value={currentJob.locationName} type="text" />
            <FieldRenderer label="Cost Center" value={currentJob.costCenter} type="text" />
            <FieldRenderer label="Manager" value={currentJob.managerName} type="text" />
            <FieldRenderer label="Effective Date" value={currentJob.effectiveDate} type="date" />
          </dl>
        </InfoCard>
      )}

      {/* Emergency Contacts */}
      <InfoCard title="Emergency Contacts" editable={canEditPersonal}>
        {emergencyContacts.length === 0 ? (
          <p className="text-sm text-[#62666d]">No emergency contacts added.</p>
        ) : (
          <div className="space-y-3">
            {emergencyContacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-md border border-[rgba(255,255,255,0.05)] p-3"
              >
                <div className="text-sm font-[510] text-[#f7f8f8]">{contact.name}</div>
                <div className="text-xs text-[#8a8f98]">{contact.relationship}</div>
                <div className="mt-1 text-xs text-[#d0d6e0]">{contact.phone}</div>
                {contact.email && <div className="text-xs text-[#d0d6e0]">{contact.email}</div>}
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      {/* Addresses */}
      <InfoCard title="Addresses" editable={canEditPersonal}>
        {addresses.length === 0 ? (
          <p className="text-sm text-[#62666d]">No addresses added.</p>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div key={addr.id} className="rounded-md border border-[rgba(255,255,255,0.05)] p-3">
                <div className="text-xs font-[510] text-[#8a8f98] uppercase mb-1">{addr.type}</div>
                <div className="text-sm text-[#d0d6e0]">
                  {addr.line1}
                  {addr.line2 && <>, {addr.line2}</>}
                  <br />
                  {addr.city}
                  {addr.state && `, ${addr.state}`}
                  {addr.postalCode && ` ${addr.postalCode}`}
                  <br />
                  {addr.country}
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      {/* Country-Specific Fields */}
      {countryFields.length > 0 && (
        <InfoCard title="Country-Specific Information" editable={canEditPersonal}>
          <FieldGroupRenderer fields={countryFields} />
        </InfoCard>
      )}

      {/* Custom Fields */}
      {customFields.length > 0 && (
        <InfoCard title="Custom Fields" editable={canEditPersonal}>
          <FieldGroupRenderer fields={customFields} />
        </InfoCard>
      )}

      {/* Bank Details */}
      {bankDetails && (
        <InfoCard title="Bank Details" editable={canEditBank}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FieldRenderer label="Account Number" value={bankDetails.accountNumber} type="text" />
            <FieldRenderer label="Bank Name" value={bankDetails.bankName} type="text" />
            <FieldRenderer label="Branch" value={bankDetails.branchName} type="text" />
            <FieldRenderer label="Account Holder" value={bankDetails.holderName} type="text" />
            <FieldRenderer label="SWIFT Code" value={bankDetails.swiftCode} type="text" />
          </dl>
        </InfoCard>
      )}
    </div>
  )
}
```

- [ ] **14.3** Create `apps/web-people/src/components/profile/tab-job-history.tsx`:

```tsx
// apps/web-people/src/components/profile/tab-job-history.tsx
'use client'

import * as React from 'react'
import { Skeleton } from '@future/ui'
import { TimelineEntry } from '../timeline-entry'
import type { JobHistoryEntry } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TabJobHistoryProps {
  employmentId: string
}

export function TabJobHistory({ employmentId }: TabJobHistoryProps) {
  const [entries, setEntries] = React.useState<JobHistoryEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.jobHistory.query({
          employmentId,
        }) as Promise<{ entries: JobHistoryEntry[] }>)
        setEntries(result.entries)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="text-sm text-[#62666d] py-8 text-center">No job history recorded.</p>
  }

  return (
    <div className="space-y-0">
      {entries.map((entry) => (
        <TimelineEntry
          key={entry.id}
          eventType={entry.eventType}
          effectiveDate={entry.effectiveDate}
          title={entry.jobTitle}
          subtitle={entry.department}
          reason={entry.reason}
          isCurrent={entry.isCurrent}
          isFuture={entry.isFuture}
          before={entry.before}
          after={entry.after}
        />
      ))}
    </div>
  )
}
```

- [ ] **14.4** Create `apps/web-people/src/components/profile/tab-documents.tsx`:

```tsx
// apps/web-people/src/components/profile/tab-documents.tsx
'use client'

import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Upload, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import type { EmployeeDocument, DocumentRequirement } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const documentColumns: ColumnDef<EmployeeDocument>[] = [
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) => (
      <Badge variant="secondary">{getValue() as string}</Badge>
    ),
  },
  {
    accessorKey: 'uploadDate',
    header: 'Uploaded',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'expiryDate',
    header: 'Expiry',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) => {
      const date = getValue() as string | null
      if (!date) return <span className="text-[#62666d]">--</span>
      const daysRemaining = Math.ceil(
        (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
      const color =
        daysRemaining < 0
          ? 'text-red-400'
          : daysRemaining < 30
            ? 'text-red-400'
            : daysRemaining < 90
              ? 'text-amber-400'
              : 'text-[#d0d6e0]'
      return (
        <span className={color}>
          {new Date(date).toLocaleDateString('en-GB')}
          {daysRemaining <= 90 && <span className="ml-1 text-xs">({daysRemaining}d)</span>}
        </span>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }: CellContext<EmployeeDocument, unknown>) => {
      const status = getValue() as string
      const config: Record<
        string,
        { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
      > = {
        valid: { label: 'Valid', variant: 'default' },
        expiring_soon: { label: 'Expiring Soon', variant: 'outline' },
        expired: { label: 'Expired', variant: 'destructive' },
        pending_review: { label: 'Pending Review', variant: 'secondary' },
      }
      const c = config[status] ?? { label: status, variant: 'secondary' as const }
      return <Badge variant={c.variant}>{c.label}</Badge>
    },
  },
]

interface TabDocumentsProps {
  employmentId: string
  canUpload: boolean
}

export function TabDocuments({ employmentId, canUpload }: TabDocumentsProps) {
  const [documents, setDocuments] = React.useState<EmployeeDocument[]>([])
  const [requirements, setRequirements] = React.useState<DocumentRequirement[]>([])
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.documents.query({
          employmentId,
        }) as Promise<{ documents: EmployeeDocument[]; requirements: DocumentRequirement[] }>)
        setDocuments(result.documents)
        setRequirements(result.requirements)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  return (
    <div className="space-y-6">
      {/* Requirements checklist */}
      {requirements.length > 0 && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-3">Required Documents</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {requirements.map((req) => (
              <div key={req.category + req.title} className="flex items-center gap-2 text-sm">
                {req.submitted ? (
                  <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
                ) : req.required ? (
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                ) : (
                  <Clock className="h-4 w-4 text-[#62666d]" />
                )}
                <span className={req.submitted ? 'text-[#d0d6e0]' : 'text-[#8a8f98]'}>
                  {req.title}
                </span>
                {req.required && !req.submitted && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1">
                    Required
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Upload button + document table */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-[590] text-[#f7f8f8]">Documents</h3>
        {canUpload && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" className="gap-1">
                <Upload className="h-3.5 w-3.5" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
              </DialogHeader>
              <DocumentUploadForm employmentId={employmentId} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <DataTable
        columns={documentColumns}
        rows={documents}
        state={tableState}
        totalCount={documents.length}
        onStateChange={setTableState}
        isLoading={isLoading}
      />
    </div>
  )
}

function DocumentUploadForm({ employmentId }: { employmentId: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-dashed border-[rgba(255,255,255,0.08)] p-8 text-center">
        <Upload className="mx-auto h-8 w-8 text-[#62666d] mb-2" />
        <p className="text-sm text-[#8a8f98]">Drop files here or click to browse</p>
        <input type="file" className="hidden" />
      </div>
      <div className="space-y-3">
        <Input placeholder="Document title" />
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="identity">Identity</SelectItem>
            <SelectItem value="tax">Tax</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="certification">Certification</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" placeholder="Expiry date (optional)" />
        <Button className="w-full">Upload</Button>
      </div>
    </div>
  )
}
```

- [ ] **14.5** Create `apps/web-people/src/components/profile/tab-contracts.tsx`:

```tsx
// apps/web-people/src/components/profile/tab-contracts.tsx
'use client'

import * as React from 'react'
import { Card, Badge, Button, Alert, Skeleton } from '@future/ui'
import { FileText, Plus } from 'lucide-react'
import type { ContractVersion } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const contractStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  active: { label: 'Active', variant: 'default' },
  expired: { label: 'Expired', variant: 'secondary' },
  superseded: { label: 'Superseded', variant: 'outline' },
  draft: { label: 'Draft', variant: 'outline' },
}

interface TabContractsProps {
  employmentId: string
  canCreate: boolean
  canViewSalary: boolean
}

export function TabContracts({ employmentId, canCreate, canViewSalary }: TabContractsProps) {
  const [contracts, setContracts] = React.useState<ContractVersion[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.contracts.query({
          employmentId,
        }) as Promise<{ contracts: ContractVersion[] }>)
        setContracts(result.contracts)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button variant="default" size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            New Contract
          </Button>
        </div>
      )}

      {contracts.length === 0 ? (
        <p className="text-sm text-[#62666d] py-8 text-center">No contracts recorded.</p>
      ) : (
        contracts.map((contract) => {
          const statusCfg = contractStatusConfig[contract.status] ?? {
            label: contract.status,
            variant: 'secondary' as const,
          }
          const isExpiringSoon =
            contract.endDate &&
            contract.status === 'active' &&
            Math.ceil((new Date(contract.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <
              90

          return (
            <Card
              key={contract.id}
              className={`border p-5 ${
                contract.status === 'active'
                  ? 'border-[#7170ff]/30 bg-[rgba(113,112,255,0.04)]'
                  : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]'
              }`}
            >
              {isExpiringSoon && (
                <Alert className="mb-3 border-amber-500/30 bg-amber-500/5 text-sm text-amber-200">
                  Contract expiring soon
                </Alert>
              )}
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{contract.contractType.replace('_', ' ')}</Badge>
                    <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                  </div>
                  <div className="text-sm text-[#d0d6e0]">
                    {new Date(contract.startDate).toLocaleDateString('en-GB')}
                    {contract.endDate &&
                      ` - ${new Date(contract.endDate).toLocaleDateString('en-GB')}`}
                    {!contract.endDate && ' - Indefinite'}
                  </div>
                  {canViewSalary && contract.baseSalary != null && (
                    <div className="text-sm text-[#8a8f98]">
                      Base salary: {contract.currency} {contract.baseSalary.toLocaleString()}
                    </div>
                  )}
                  {contract.signedDate && (
                    <div className="text-xs text-[#62666d]">
                      Signed: {new Date(contract.signedDate).toLocaleDateString('en-GB')}
                    </div>
                  )}
                </div>
                {contract.documentId && (
                  <Button variant="outline" size="sm" className="gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    View Contract
                  </Button>
                )}
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
```

- [ ] **14.6** Create `apps/web-people/src/components/profile/tab-sections.tsx`:

```tsx
// apps/web-people/src/components/profile/tab-sections.tsx
'use client'

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger, Card, Badge, Button, Skeleton } from '@future/ui'
import { Plus, Edit, Trash2, Linkedin } from 'lucide-react'
import type { ProfileSection } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const sectionLabels: Record<string, string> = {
  education: 'Education',
  work_experience: 'Work Experience',
  certification: 'Certifications',
  skill: 'Skills',
  language: 'Languages',
  social_link: 'Social Links',
  dependent: 'Dependents',
}

interface TabSectionsProps {
  employmentId: string
  canEdit: boolean
}

export function TabSections({ employmentId, canEdit }: TabSectionsProps) {
  const [sections, setSections] = React.useState<ProfileSection[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.sections.query({
          employmentId,
        }) as Promise<{ sections: ProfileSection[] }>)
        setSections(result.sections)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  const grouped = sections.reduce<Record<string, ProfileSection[]>>((acc, s) => {
    if (!acc[s.sectionType]) acc[s.sectionType] = []
    acc[s.sectionType].push(s)
    return acc
  }, {})

  const sectionTypes = Object.keys(sectionLabels)

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-1">
            <Linkedin className="h-3.5 w-3.5" />
            Import from LinkedIn
          </Button>
        </div>
      )}

      <Tabs defaultValue="education">
        <TabsList>
          {sectionTypes.map((type) => (
            <TabsTrigger key={type} value={type} className="text-xs gap-1">
              {sectionLabels[type]}
              {grouped[type] && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                  {grouped[type].length}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {sectionTypes.map((type) => (
          <TabsContent key={type} value={type} className="mt-4">
            {type === 'skill' ? (
              <SkillsView entries={grouped[type] ?? []} canEdit={canEdit} />
            ) : (
              <SectionList entries={grouped[type] ?? []} sectionType={type} canEdit={canEdit} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function SectionList({
  entries,
  sectionType,
  canEdit,
}: {
  entries: ProfileSection[]
  sectionType: string
  canEdit: boolean
}) {
  if (entries.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-[#62666d]">
          No {sectionLabels[sectionType]?.toLowerCase()} entries yet.
        </p>
        {canEdit && (
          <Button variant="outline" size="sm" className="mt-3 gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add {sectionLabels[sectionType]}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      )}
      {entries.map((entry) => (
        <Card
          key={entry.id}
          className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              {Object.entries(entry.data).map(([key, val]) => (
                <div key={key} className="text-sm">
                  <span className="text-[#8a8f98] capitalize">{key.replace(/_/g, ' ')}: </span>
                  <span className="text-[#d0d6e0]">{val == null ? '--' : String(val)}</span>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

function SkillsView({ entries, canEdit }: { entries: ProfileSection[]; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <Badge key={entry.id} variant="secondary" className="gap-1">
            {String(entry.data.name ?? entry.data.skill ?? '')}
            {canEdit && (
              <button type="button" className="ml-1 text-[#62666d] hover:text-red-400">
                x
              </button>
            )}
          </Badge>
        ))}
      </div>
      {canEdit && (
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Skill
        </Button>
      )}
    </div>
  )
}
```

- [ ] **14.7** Create `apps/web-people/src/components/profile/tab-change-requests.tsx`:

```tsx
// apps/web-people/src/components/profile/tab-change-requests.tsx
'use client'

import * as React from 'react'
import { Badge, Button, Card, Skeleton } from '@future/ui'
import { Check, X } from 'lucide-react'
import type { ChangeRequest } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TabChangeRequestsProps {
  employmentId: string
  canApprove: boolean
}

export function TabChangeRequests({ employmentId, canApprove }: TabChangeRequestsProps) {
  const [requests, setRequests] = React.useState<ChangeRequest[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.changeRequests.query({
          employmentId,
        }) as Promise<{ requests: ChangeRequest[] }>)
        setRequests(result.requests)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-6">
      {/* Pending */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-[590] text-[#f7f8f8]">
            Pending Changes
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {pending.length}
              </Badge>
            )}
          </h3>
          {canApprove && pending.length > 1 && (
            <div className="flex gap-2">
              <Button variant="default" size="sm" className="gap-1 text-xs">
                <Check className="h-3 w-3" />
                Approve All
              </Button>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                <X className="h-3 w-3" />
                Reject All
              </Button>
            </div>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-[#62666d]">No pending changes.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((req) => (
              <Card
                key={req.id}
                className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-[510] text-[#f7f8f8]">{req.fieldLabel}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#8a8f98] line-through">{req.oldValue}</span>
                      <span className="text-[#62666d]">-&gt;</span>
                      <span className="text-[#10b981] font-[510]">{req.newValue}</span>
                    </div>
                    <div className="text-xs text-[#62666d]">
                      By {req.requestedByName} on{' '}
                      {new Date(req.requestedAt).toLocaleDateString('en-GB')}
                      {req.effectiveDate && (
                        <> / Effective: {new Date(req.effectiveDate).toLocaleDateString('en-GB')}</>
                      )}
                    </div>
                  </div>
                  {canApprove && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="default" size="sm" className="h-7 gap-1">
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1">
                        <X className="h-3 w-3" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {decided.length > 0 && (
        <div>
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-3">History</h3>
          <div className="space-y-2">
            {decided.map((req) => {
              const statusCfg: Record<
                string,
                { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
              > = {
                approved: { label: 'Approved', variant: 'default' },
                rejected: { label: 'Rejected', variant: 'destructive' },
                cancelled: { label: 'Cancelled', variant: 'secondary' },
              }
              const cfg = statusCfg[req.status] ?? {
                label: req.status,
                variant: 'secondary' as const,
              }

              return (
                <Card
                  key={req.id}
                  className="border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.01)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#d0d6e0]">{req.fieldLabel}</span>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </div>
                      <div className="text-xs text-[#62666d]">
                        {req.oldValue} -&gt; {req.newValue}
                      </div>
                    </div>
                    <div className="text-xs text-[#62666d]">
                      {req.reviewedAt && new Date(req.reviewedAt).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **14.8** Create `apps/web-people/src/components/profile/tab-probation.tsx`:

```tsx
// apps/web-people/src/components/profile/tab-probation.tsx
'use client'

import { Card, Badge, Button, Separator } from '@future/ui'
import { CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react'
import type { ProbationRecord } from '../../lib/types'

const probationStatusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> =
  {
    in_progress: { label: 'In Probation', icon: Clock, color: 'text-amber-400' },
    passed: { label: 'Passed', icon: CheckCircle2, color: 'text-[#10b981]' },
    failed: { label: 'Failed', icon: XCircle, color: 'text-red-400' },
    extended: { label: 'Extended', icon: AlertTriangle, color: 'text-amber-400' },
  }

interface TabProbationProps {
  probation: ProbationRecord
  canManage: boolean
}

export function TabProbation({ probation, canManage }: TabProbationProps) {
  const config = probationStatusConfig[probation.status] ?? probationStatusConfig.in_progress
  const Icon = config.icon
  const daysRemaining = Math.ceil(
    (new Date(probation.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status card */}
      <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] ${config.color}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-[510] text-[#f7f8f8]">{config.label}</div>
            {probation.status === 'in_progress' && (
              <div className="text-sm text-[#8a8f98]">
                {daysRemaining > 0
                  ? `${daysRemaining} days remaining`
                  : `${Math.abs(daysRemaining)} days overdue`}
              </div>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-[#8a8f98]">Start Date</dt>
            <dd className="text-[#d0d6e0]">
              {new Date(probation.startDate).toLocaleDateString('en-GB')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#8a8f98]">End Date</dt>
            <dd className="text-[#d0d6e0]">
              {new Date(probation.endDate).toLocaleDateString('en-GB')}
            </dd>
          </div>
          {probation.originalEndDate !== probation.endDate && (
            <div>
              <dt className="text-xs text-[#8a8f98]">Original End Date</dt>
              <dd className="text-[#d0d6e0] line-through">
                {new Date(probation.originalEndDate).toLocaleDateString('en-GB')}
              </dd>
            </div>
          )}
          {probation.salaryPercentage != null && (
            <div>
              <dt className="text-xs text-[#8a8f98]">Salary Rate</dt>
              <dd className="text-[#d0d6e0]">{probation.salaryPercentage}% of full salary</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Extensions */}
      {probation.extensions.length > 0 && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-3">Extensions</h3>
          <div className="space-y-2">
            {probation.extensions.map((ext, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm rounded border border-[rgba(255,255,255,0.05)] p-3"
              >
                <div>
                  <div className="text-[#d0d6e0]">
                    Extended to {new Date(ext.extendedDate).toLocaleDateString('en-GB')}
                  </div>
                  <div className="text-xs text-[#62666d]">{ext.reason}</div>
                </div>
                <div className="text-xs text-[#62666d]">by {ext.extendedBy}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Actions */}
      {canManage && probation.status === 'in_progress' && (
        <div className="flex gap-2">
          <Button variant="default" className="gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Confirm Probation
          </Button>
          <Button variant="outline" className="gap-1">
            <Clock className="h-4 w-4" />
            Extend
          </Button>
          <Button
            variant="outline"
            className="gap-1 text-red-400 border-red-400/30 hover:bg-red-400/10"
          >
            <XCircle className="h-4 w-4" />
            Fail
          </Button>
        </div>
      )}
    </div>
  )
}
```

---

## Task 15 — Profile page assembly (P3)

- [ ] **15.1** Create `apps/web-people/src/components/profile/profile-tabs.tsx` that wires all 7 tabs:

```tsx
// apps/web-people/src/components/profile/profile-tabs.tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@future/ui'
import { TabOverview } from './tab-overview'
import { TabJobHistory } from './tab-job-history'
import { TabDocuments } from './tab-documents'
import { TabContracts } from './tab-contracts'
import { TabSections } from './tab-sections'
import { TabChangeRequests } from './tab-change-requests'
import { TabProbation } from './tab-probation'
import type { EmployeeProfile } from '../../lib/types'

interface ProfileTabsProps {
  profile: EmployeeProfile
  employmentId: string
  canEditPersonal: boolean
  canEditEmployment: boolean
  canEditBank: boolean
  canUploadDocuments: boolean
  canCreateContract: boolean
  canViewSalary: boolean
  canApproveChanges: boolean
  canManageProbation: boolean
  isSelf: boolean
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export function ProfileTabs({
  profile,
  employmentId,
  canEditPersonal,
  canEditEmployment,
  canEditBank,
  canUploadDocuments,
  canCreateContract,
  canViewSalary,
  canApproveChanges,
  canManageProbation,
  isSelf,
  activeTab = 'overview',
  onTabChange,
}: ProfileTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="job-history">Job History</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="contracts">Contracts</TabsTrigger>
        <TabsTrigger value="sections">Sections</TabsTrigger>
        <TabsTrigger value="changes">Change Requests</TabsTrigger>
        {profile.probation && <TabsTrigger value="probation">Probation</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <TabOverview
          profile={profile}
          canEditPersonal={canEditPersonal}
          canEditEmployment={canEditEmployment}
          canEditBank={canEditBank}
        />
      </TabsContent>

      <TabsContent value="job-history" className="mt-6">
        <TabJobHistory employmentId={employmentId} />
      </TabsContent>

      <TabsContent value="documents" className="mt-6">
        <TabDocuments employmentId={employmentId} canUpload={canUploadDocuments} />
      </TabsContent>

      <TabsContent value="contracts" className="mt-6">
        <TabContracts
          employmentId={employmentId}
          canCreate={canCreateContract}
          canViewSalary={canViewSalary}
        />
      </TabsContent>

      <TabsContent value="sections" className="mt-6">
        <TabSections employmentId={employmentId} canEdit={canEditPersonal || isSelf} />
      </TabsContent>

      <TabsContent value="changes" className="mt-6">
        <TabChangeRequests employmentId={employmentId} canApprove={canApproveChanges} />
      </TabsContent>

      {profile.probation && (
        <TabsContent value="probation" className="mt-6">
          <TabProbation probation={profile.probation} canManage={canManageProbation} />
        </TabsContent>
      )}
    </Tabs>
  )
}
```

- [ ] **15.2** Create `apps/web-people/src/app/profile/[employmentId]/page.tsx`:

```tsx
// apps/web-people/src/app/profile/[employmentId]/page.tsx
'use client'

import * as React from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Breadcrumb, Skeleton } from '@future/ui'
import { ProfileHeader } from '../../../components/profile/profile-header'
import { ProfileTabs } from '../../../components/profile/profile-tabs'
import type { EmployeeProfile } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function EmployeeProfilePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const employmentId = params.employmentId as string
  const activeTab = searchParams.get('tab') ?? 'overview'

  const [profile, setProfile] = React.useState<EmployeeProfile | null>(null)
  const [permissions, setPermissions] = React.useState({
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
  })
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.get.query({
          employmentId,
        }) as Promise<{ profile: EmployeeProfile; permissions: typeof permissions }>)
        setProfile(result.profile)
        setPermissions(result.permissions)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  function handleTabChange(tab: string) {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    router.replace(`${window.location.pathname}?${params.toString()}`)
  }

  if (isLoading) {
    return (
      <main className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="container mx-auto py-8">
        <p className="text-sm text-[#8a8f98]">Employee not found.</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto py-8 space-y-6">
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
```

- [ ] **15.3** Create `apps/web-people/src/app/profile/[employmentId]/loading.tsx`:

```tsx
// apps/web-people/src/app/profile/[employmentId]/loading.tsx
import { Skeleton } from '@future/ui'

export default function ProfileLoading() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-6">
        <Skeleton className="h-24 w-24 rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </main>
  )
}
```

---

## Task 16 — My Profile page (P4)

- [ ] **16.1** Create `apps/web-people/src/app/me/page.tsx`:

```tsx
// apps/web-people/src/app/me/page.tsx
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
        const result = await (anyTrpc.people.profile.me.query() as Promise<{
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
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    router.replace(`${window.location.pathname}?${params.toString()}`)
  }

  if (isLoading) {
    return (
      <main className="container mx-auto py-8 space-y-6">
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
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">My Profile</h1>
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
```

---

## Task 17 — tRPC hooks

- [ ] **17.1** Create `apps/web-people/src/lib/hooks/use-employee-profile.ts` as the primary data-fetching hook pattern:

```typescript
// apps/web-people/src/lib/hooks/use-employee-profile.ts
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

type UseEmployeeProfileReturn = {
  profile: EmployeeProfile | null
  permissions: ProfilePermissions
  isLoading: boolean
  error: string | null
  refetch: () => void
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
```

- [ ] **17.2** Create `use-directory.ts`, `use-org-chart.ts`, `use-change-requests.ts`, `use-documents.ts` following the same pattern — each wraps the relevant tRPC procedure with loading/error state and refetch capability.
- [ ] **17.3** Consider migrating from manual `useEffect` + state to `@tanstack/react-query` integration with tRPC for automatic caching, deduplication, and background refetching. Document as a follow-up optimization.

---

## Task 18 — Write remaining tests

- [ ] **18.1** Write `apps/web-people/src/components/profile/profile-header.spec.tsx` — renders name, actions, probation banner.
- [ ] **18.2** Write `apps/web-people/src/components/profile/tab-overview.spec.tsx` — renders all info cards, handles empty states.
- [ ] **18.3** Write `apps/web-people/src/components/people-directory-table.spec.tsx` — column rendering, view toggle, row click navigation.
- [ ] **18.4** Verify all components render without errors using `bun run --filter web-people build`.
