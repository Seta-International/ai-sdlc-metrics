# People Module — Plan 08: Frontend — Workflows, Reports & Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining `web-people` zone pages — Onboarding (P5), Offboarding (P6), Change Requests (P7), Reports (P8a-P8e), Settings (P9a-P9j), Shared Profile (P10), and Bulk Operations (P11). This plan depends on all Plan 07 shared components (StatusBadge, FieldRenderer, TimelineEntry, etc.).

**Architecture:** Next.js App Router, React Server Components where possible, `'use client'` for interactive components. All data via tRPC to `apps/api`. Shared components from `@future/ui`. URL state management via existing `table-url-state` pattern.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, @tanstack/react-table, tRPC, Zod, Lucide icons, React Hook Form

**Spec Reference:** `docs/superpowers/specs/2026-04-15-people-module-redesign.md` — Section 20.2 (Pages P5-P11)

**Design Reference:** `DESIGN.md` — dark-mode-first, Inter Variable with `"cv01","ss03"`, weight 510 signature, brand indigo `#5e6ad2`/`#7170ff`

**Depends on:** Plan 07 (shared components, types, navigation, tRPC hooks pattern)

---

## File Structure

### Files to CREATE

```
# Onboarding (P5)
apps/web-people/src/app/onboarding/page.tsx
apps/web-people/src/app/onboarding/[caseId]/page.tsx
apps/web-people/src/components/onboarding/onboarding-cases-table.tsx
apps/web-people/src/components/onboarding/onboarding-my-tasks.tsx
apps/web-people/src/components/onboarding/onboarding-case-detail.tsx

# Offboarding (P6)
apps/web-people/src/app/offboarding/page.tsx
apps/web-people/src/app/offboarding/[caseId]/page.tsx
apps/web-people/src/components/offboarding/offboarding-cases-table.tsx
apps/web-people/src/components/offboarding/offboarding-my-tasks.tsx
apps/web-people/src/components/offboarding/offboarding-case-detail.tsx

# Change Requests (P7)
apps/web-people/src/app/change-requests/page.tsx
apps/web-people/src/components/change-requests/change-request-queue.tsx

# Reports (P8)
apps/web-people/src/app/reports/layout.tsx
apps/web-people/src/app/reports/page.tsx
apps/web-people/src/app/reports/headcount/page.tsx
apps/web-people/src/app/reports/completeness/page.tsx
apps/web-people/src/app/reports/documents/page.tsx
apps/web-people/src/app/reports/probation/page.tsx
apps/web-people/src/app/reports/contracts/page.tsx
apps/web-people/src/components/reports/summary-cards.tsx
apps/web-people/src/components/reports/reports-sidebar.tsx

# Settings (P9)
apps/web-people/src/app/settings/layout.tsx
apps/web-people/src/app/settings/page.tsx
apps/web-people/src/app/settings/job-catalog/page.tsx
apps/web-people/src/app/settings/onboarding-templates/page.tsx
apps/web-people/src/app/settings/offboarding-templates/page.tsx
apps/web-people/src/app/settings/countries/page.tsx
apps/web-people/src/app/settings/countries/[countryCode]/page.tsx
apps/web-people/src/app/settings/custom-fields/page.tsx
apps/web-people/src/app/settings/edit-policies/page.tsx
apps/web-people/src/app/settings/visibility/page.tsx
apps/web-people/src/app/settings/email/page.tsx
apps/web-people/src/app/settings/completeness/page.tsx
apps/web-people/src/app/settings/import/page.tsx
apps/web-people/src/components/settings/settings-sidebar.tsx
apps/web-people/src/components/settings/job-catalog-editor.tsx
apps/web-people/src/components/settings/template-editor.tsx
apps/web-people/src/components/settings/country-config-tabs.tsx
apps/web-people/src/components/settings/custom-field-dialog.tsx
apps/web-people/src/components/settings/field-policy-list.tsx
apps/web-people/src/components/settings/import-wizard.tsx

# Shared Profile (P10)
apps/web-people/src/app/shared/profile/[token]/page.tsx
apps/web-people/src/app/shared/profile/[token]/layout.tsx

# Bulk Operations (P11)
apps/web-people/src/app/bulk/page.tsx
apps/web-people/src/components/bulk/bulk-wizard.tsx
apps/web-people/src/components/bulk/bulk-employee-selector.tsx
apps/web-people/src/components/bulk/bulk-preview-table.tsx

# Additional types
apps/web-people/src/lib/types-workflows.ts

# Tests (co-located)
apps/web-people/src/components/onboarding/onboarding-cases-table.spec.tsx
apps/web-people/src/components/change-requests/change-request-queue.spec.tsx
apps/web-people/src/components/settings/import-wizard.spec.tsx
apps/web-people/src/components/bulk/bulk-wizard.spec.tsx
```

---

## Task 1 — Workflow types

- [ ] **1.1** Create `apps/web-people/src/lib/types-workflows.ts`:

```typescript
// apps/web-people/src/lib/types-workflows.ts

// --- Onboarding / Offboarding ---
export type OnboardingCase = {
  id: string
  employmentId: string
  employeeName: string
  avatarUrl: string | null
  templateName: string
  startDate: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  tasksTotal: number
  tasksCompleted: number
  department: string
}

export type OffboardingCase = {
  id: string
  employmentId: string
  employeeName: string
  avatarUrl: string | null
  reasonCategory: string
  terminationReason: string | null
  lastWorkingDay: string
  status: 'pending_approval' | 'in_progress' | 'completed' | 'cancelled'
  tasksTotal: number
  tasksCompleted: number
}

export type WorkflowTask = {
  id: string
  caseId: string
  employeeName: string
  title: string
  description: string | null
  assigneeRole: string
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  isOverdue: boolean
  isRequired: boolean
  status: 'pending' | 'completed' | 'skipped'
  evidenceDocumentId: string | null
  linkedDocumentRequirement: string | null
}

// --- Change Requests (P7) ---
export type ChangeRequestRow = {
  id: string
  employmentId: string
  employeeName: string
  avatarUrl: string | null
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
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNote: string | null
  editPolicyLabel: string
}

// --- Reports ---
export type HeadcountSummary = {
  totalActive: number
  newHiresThisMonth: number
  terminationsThisMonth: number
  netChange: number
  trend: Array<{ month: string; count: number }>
  byDepartment: Array<{ name: string; count: number }>
  byCountry: Array<{ code: string; name: string; count: number }>
  byType: Array<{ type: string; count: number }>
}

export type CompletenessRow = {
  employmentId: string
  employeeName: string
  department: string
  score: number
  missingCount: number
  daysSinceHire: number
}

export type ExpiringDocumentRow = {
  employmentId: string
  employeeName: string
  documentTitle: string
  category: string
  expiryDate: string
  daysRemaining: number
}

export type ProbationRow = {
  employmentId: string
  employeeName: string
  startDate: string
  endDate: string
  daysRemaining: number
  status: 'in_progress' | 'extended' | 'overdue'
}

export type ExpiringContractRow = {
  employmentId: string
  employeeName: string
  contractType: string
  endDate: string
  daysRemaining: number
  country: string
}

// --- Settings ---
export type JobFamily = {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  profileCount: number
  children?: JobFamily[]
}

export type JobProfileRow = {
  id: string
  title: string
  level: string | null
  familyId: string
  isActive: boolean
  assignmentCount: number
}

export type OnboardingTemplate = {
  id: string
  name: string
  countryScope: string | null
  employmentTypeScope: string | null
  isDefault: boolean
  taskCount: number
  tasks: TemplateTask[]
}

export type TemplateTask = {
  id: string
  title: string
  description: string | null
  assigneeRole: string
  dueDays: number
  isRequired: boolean
  linkedDocumentRequirement: string | null
  sortOrder: number
}

export type CountryConfig = {
  code: string
  name: string
  fieldCount: number
  probationPolicyCount: number
  documentRequirementCount: number
}

export type CustomFieldDefinition = {
  id: string
  fieldKey: string
  label: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  group: string
  isRequired: boolean
  isSearchable: boolean
  isFilterable: boolean
  visibilityTier: 'public' | 'restricted' | 'confidential'
  isActive: boolean
  options: string[] | null
  validationRules: Record<string, unknown> | null
}

export type FieldPolicyEntry = {
  fieldPath: string
  fieldLabel: string
  section: string
  editMode: 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'
}

export type FieldVisibilityEntry = {
  fieldPath: string
  fieldLabel: string
  section: string
  tier: 'public' | 'restricted' | 'confidential'
}

export type EmailConfig = {
  domain: string
  pattern: 'given_family' | 'given_initial_family' | 'family_given' | 'given_dot_family'
  transliterationMode: 'ascii' | 'vietnamese_ascii'
}

export type CompletenessRule = {
  id: string
  fieldPath: string
  label: string
  section: string
  weight: number
  isRequired: boolean
  countryScope: string | null
  deadlineDays: number | null
}

export type ImportJob = {
  id: string
  filename: string
  status: 'processing' | 'completed' | 'failed'
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  uploadedBy: string
  uploadedAt: string
}

// --- Bulk Operations ---
export type BulkOperationType = 'change_department' | 'change_manager' | 'change_status'

export type BulkPreviewRow = {
  employmentId: string
  employeeName: string
  currentValue: string
  newValue: string
  isValid: boolean
  validationError: string | null
}
```

---

## Task 2 — Onboarding page (P5)

- [ ] **2.1** Create `apps/web-people/src/components/onboarding/onboarding-cases-table.tsx`:

```tsx
// apps/web-people/src/components/onboarding/onboarding-cases-table.tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Badge, Progress, type FutureTableState, defaultTableState } from '@future/ui'
import { AvatarNameCell } from '../avatar-name-cell'
import type { OnboardingCase } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const caseStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

const columns: ColumnDef<OnboardingCase>[] = [
  {
    accessorKey: 'employeeName',
    header: 'Employee',
    enableSorting: true,
    cell: ({ row }: CellContext<OnboardingCase, unknown>) => (
      <AvatarNameCell
        fullName={row.original.employeeName}
        avatarUrl={row.original.avatarUrl}
        subtitle={row.original.department}
      />
    ),
  },
  {
    accessorKey: 'templateName',
    header: 'Template',
    enableSorting: true,
  },
  {
    accessorKey: 'startDate',
    header: 'Start Date',
    enableSorting: true,
    cell: ({ getValue }: CellContext<OnboardingCase, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    id: 'progress',
    header: 'Progress',
    cell: ({ row }: CellContext<OnboardingCase, unknown>) => {
      const pct =
        row.original.tasksTotal > 0
          ? Math.round((row.original.tasksCompleted / row.original.tasksTotal) * 100)
          : 0
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="text-xs text-[#8a8f98] whitespace-nowrap">
            {row.original.tasksCompleted}/{row.original.tasksTotal}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: true,
    cell: ({ getValue }: CellContext<OnboardingCase, unknown>) => {
      const status = getValue() as string
      const cfg = caseStatusConfig[status] ?? { label: status, variant: 'secondary' as const }
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>
    },
  },
]

export function OnboardingCasesTable() {
  const router = useRouter()
  const [cases, setCases] = React.useState<OnboardingCase[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.onboarding.listCases.query({
          ...tableState,
        }) as Promise<{ cases: OnboardingCase[]; totalCount: number }>)
        setCases(result.cases)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  return (
    <DataTable
      columns={columns}
      rows={cases}
      state={tableState}
      totalCount={totalCount}
      onStateChange={setTableState}
      onRowClick={(row) => router.push(`/onboarding/${row.id}`)}
      isLoading={isLoading}
    />
  )
}
```

- [ ] **2.2** Create `apps/web-people/src/components/onboarding/onboarding-my-tasks.tsx`:

```tsx
// apps/web-people/src/components/onboarding/onboarding-my-tasks.tsx
'use client'

import * as React from 'react'
import { Card, Badge, Button } from '@future/ui'
import { CheckCircle2, Clock, AlertTriangle, Upload } from 'lucide-react'
import type { WorkflowTask } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export function OnboardingMyTasks() {
  const [tasks, setTasks] = React.useState<WorkflowTask[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.onboarding.myTasks.query() as Promise<{
          tasks: WorkflowTask[]
        }>)
        setTasks(result.tasks)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  if (isLoading) {
    return <div className="text-sm text-[#8a8f98] py-8 text-center">Loading tasks...</div>
  }

  if (tasks.length === 0) {
    return <div className="text-sm text-[#62666d] py-8 text-center">No tasks assigned to you.</div>
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <Card
          key={task.id}
          className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {task.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-[#10b981] mt-0.5 shrink-0" />
              ) : task.isOverdue ? (
                <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
              ) : (
                <Clock className="h-5 w-5 text-[#8a8f98] mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-[510] text-[#f7f8f8]">{task.title}</div>
                <div className="text-xs text-[#8a8f98] mt-0.5">For: {task.employeeName}</div>
                {task.dueDate && (
                  <div
                    className={`text-xs mt-0.5 ${task.isOverdue ? 'text-red-400' : 'text-[#62666d]'}`}
                  >
                    Due: {new Date(task.dueDate).toLocaleDateString('en-GB')}
                    {task.isOverdue && ' (overdue)'}
                  </div>
                )}
              </div>
            </div>
            {task.status === 'pending' && (
              <div className="flex gap-2 shrink-0">
                <Button variant="default" size="sm" className="gap-1 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complete
                </Button>
                {task.linkedDocumentRequirement && (
                  <Button variant="outline" size="sm" className="gap-1 text-xs">
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **2.3** Create `apps/web-people/src/components/onboarding/onboarding-case-detail.tsx`:

```tsx
// apps/web-people/src/components/onboarding/onboarding-case-detail.tsx
'use client'

import * as React from 'react'
import { Card, Badge, Button, Progress, Separator, Skeleton } from '@future/ui'
import { CheckCircle2, Clock, SkipForward } from 'lucide-react'
import { AvatarNameCell } from '../avatar-name-cell'
import type { OnboardingCase, WorkflowTask } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface OnboardingCaseDetailProps {
  caseId: string
}

export function OnboardingCaseDetail({ caseId }: OnboardingCaseDetailProps) {
  const [caseData, setCaseData] = React.useState<OnboardingCase | null>(null)
  const [tasks, setTasks] = React.useState<WorkflowTask[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.onboarding.getCase.query({
          caseId,
        }) as Promise<{ caseData: OnboardingCase; tasks: WorkflowTask[] }>)
        setCaseData(result.caseData)
        setTasks(result.tasks)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [caseId])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!caseData) {
    return <p className="text-sm text-[#8a8f98]">Case not found.</p>
  }

  const pct =
    caseData.tasksTotal > 0 ? Math.round((caseData.tasksCompleted / caseData.tasksTotal) * 100) : 0

  // Group tasks by assignee role
  const grouped = tasks.reduce<Record<string, WorkflowTask[]>>((acc, t) => {
    const role = t.assigneeRole || 'Unassigned'
    if (!acc[role]) acc[role] = []
    acc[role].push(t)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
        <div className="flex items-center justify-between">
          <AvatarNameCell
            fullName={caseData.employeeName}
            avatarUrl={caseData.avatarUrl}
            subtitle={caseData.templateName}
          />
          <Badge variant="default">{caseData.status.replace('_', ' ')}</Badge>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-sm font-[510] text-[#d0d6e0]">{pct}%</span>
        </div>
        <div className="mt-2 text-xs text-[#62666d]">
          {caseData.tasksCompleted} of {caseData.tasksTotal} tasks completed
        </div>
      </Card>

      {/* Tasks grouped by role */}
      {Object.entries(grouped).map(([role, roleTasks]) => (
        <div key={role}>
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-3 capitalize">
            {role.replace('_', ' ')} Tasks
          </h3>
          <div className="space-y-2">
            {roleTasks.map((task) => (
              <Card
                key={task.id}
                className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-[#10b981] mt-0.5 shrink-0" />
                    ) : task.status === 'skipped' ? (
                      <SkipForward className="h-4 w-4 text-[#62666d] mt-0.5 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-[#8a8f98] mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-[#d0d6e0]">
                        {task.title}
                        {task.isRequired && (
                          <Badge variant="destructive" className="ml-2 h-4 px-1 text-[10px]">
                            Required
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <div className="text-xs text-[#62666d] mt-0.5">{task.description}</div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-[#62666d] mt-1">
                        {task.assigneeName && <span>Assigned: {task.assigneeName}</span>}
                        {task.dueDate && (
                          <span className={task.isOverdue ? 'text-red-400' : ''}>
                            Due: {new Date(task.dueDate).toLocaleDateString('en-GB')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {task.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="default" size="sm" className="h-7 text-xs">
                        Complete
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        Skip
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **2.4** Create `apps/web-people/src/app/onboarding/page.tsx`:

```tsx
// apps/web-people/src/app/onboarding/page.tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@future/ui'
import { OnboardingCasesTable } from '../../components/onboarding/onboarding-cases-table'
import { OnboardingMyTasks } from '../../components/onboarding/onboarding-my-tasks'

export default function OnboardingPage() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Onboarding</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">Manage onboarding cases and tasks.</p>
      </div>

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Active Cases</TabsTrigger>
          <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="cases" className="mt-4">
          <OnboardingCasesTable />
        </TabsContent>
        <TabsContent value="my-tasks" className="mt-4">
          <OnboardingMyTasks />
        </TabsContent>
      </Tabs>
    </main>
  )
}
```

- [ ] **2.5** Create `apps/web-people/src/app/onboarding/[caseId]/page.tsx`:

```tsx
// apps/web-people/src/app/onboarding/[caseId]/page.tsx
'use client'

import { useParams } from 'next/navigation'
import { Breadcrumb } from '@future/ui'
import { OnboardingCaseDetail } from '../../../components/onboarding/onboarding-case-detail'

export default function OnboardingCaseDetailPage() {
  const params = useParams()
  return (
    <main className="container mx-auto py-8 space-y-6">
      <OnboardingCaseDetail caseId={params.caseId as string} />
    </main>
  )
}
```

- [ ] **2.6** Write `onboarding-cases-table.spec.tsx` — renders columns, row click navigates.

---

## Task 3 — Offboarding page (P6)

- [ ] **3.1** Create offboarding components mirroring onboarding structure. Create `apps/web-people/src/components/offboarding/offboarding-cases-table.tsx` — same as onboarding but with termination reason column and last working day:

```tsx
// apps/web-people/src/components/offboarding/offboarding-cases-table.tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import { DataTable, Badge, Progress, type FutureTableState, defaultTableState } from '@future/ui'
import { AvatarNameCell } from '../avatar-name-cell'
import type { OffboardingCase } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<OffboardingCase>[] = [
  {
    accessorKey: 'employeeName',
    header: 'Employee',
    enableSorting: true,
    cell: ({ row }: CellContext<OffboardingCase, unknown>) => (
      <AvatarNameCell fullName={row.original.employeeName} avatarUrl={row.original.avatarUrl} />
    ),
  },
  {
    accessorKey: 'reasonCategory',
    header: 'Reason',
    cell: ({ getValue }: CellContext<OffboardingCase, unknown>) => (
      <Badge variant="outline">{(getValue() as string).replace('_', ' ')}</Badge>
    ),
  },
  {
    accessorKey: 'lastWorkingDay',
    header: 'Last Day',
    enableSorting: true,
    cell: ({ getValue }: CellContext<OffboardingCase, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    id: 'progress',
    header: 'Progress',
    cell: ({ row }: CellContext<OffboardingCase, unknown>) => {
      const pct =
        row.original.tasksTotal > 0
          ? Math.round((row.original.tasksCompleted / row.original.tasksTotal) * 100)
          : 0
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="text-xs text-[#8a8f98]">
            {row.original.tasksCompleted}/{row.original.tasksTotal}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }: CellContext<OffboardingCase, unknown>) => {
      const status = getValue() as string
      const cfg: Record<
        string,
        { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
      > = {
        pending_approval: { label: 'Pending Approval', variant: 'outline' },
        in_progress: { label: 'In Progress', variant: 'default' },
        completed: { label: 'Completed', variant: 'secondary' },
        cancelled: { label: 'Cancelled', variant: 'destructive' },
      }
      const c = cfg[status] ?? { label: status, variant: 'secondary' as const }
      return <Badge variant={c.variant}>{c.label}</Badge>
    },
  },
]

export function OffboardingCasesTable() {
  const router = useRouter()
  const [cases, setCases] = React.useState<OffboardingCase[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.offboarding.listCases.query({
          ...tableState,
        }) as Promise<{ cases: OffboardingCase[]; totalCount: number }>)
        setCases(result.cases)
        setTotalCount(result.totalCount)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [tableState])

  return (
    <DataTable
      columns={columns}
      rows={cases}
      state={tableState}
      totalCount={totalCount}
      onStateChange={setTableState}
      onRowClick={(row) => router.push(`/offboarding/${row.id}`)}
      isLoading={isLoading}
    />
  )
}
```

- [ ] **3.2** Create `offboarding-my-tasks.tsx` and `offboarding-case-detail.tsx` — same structure as onboarding equivalents, reusing same task card patterns. Offboarding case detail includes approval status section with Approve/Reject buttons when `status === 'pending_approval'`.
- [ ] **3.3** Create `apps/web-people/src/app/offboarding/page.tsx` and `apps/web-people/src/app/offboarding/[caseId]/page.tsx` — same tab layout as onboarding.

---

## Task 4 — Change Requests page (P7)

- [ ] **4.1** Create `apps/web-people/src/components/change-requests/change-request-queue.tsx`:

```tsx
// apps/web-people/src/components/change-requests/change-request-queue.tsx
'use client'

import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  Badge,
  Button,
  Card,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Check, X } from 'lucide-react'
import { AvatarNameCell } from '../avatar-name-cell'
import type { ChangeRequestRow } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<ChangeRequestRow>[] = [
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
  },
  {
    accessorKey: 'employeeName',
    header: 'Employee',
    enableSorting: true,
    cell: ({ row }: CellContext<ChangeRequestRow, unknown>) => (
      <AvatarNameCell fullName={row.original.employeeName} avatarUrl={row.original.avatarUrl} />
    ),
  },
  {
    accessorKey: 'fieldLabel',
    header: 'Field',
    enableSorting: true,
  },
  {
    id: 'change',
    header: 'Change',
    cell: ({ row }: CellContext<ChangeRequestRow, unknown>) => (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-[#8a8f98] line-through truncate max-w-[100px]">
          {row.original.oldValue}
        </span>
        <span className="text-[#62666d]">-&gt;</span>
        <span className="text-[#10b981] font-[510] truncate max-w-[100px]">
          {row.original.newValue}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'requestedByName',
    header: 'Requested By',
  },
  {
    accessorKey: 'requestedAt',
    header: 'Date',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'effectiveDate',
    header: 'Effective',
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) => {
      const val = getValue() as string | null
      return val ? new Date(val).toLocaleDateString('en-GB') : '--'
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) => {
      const status = getValue() as string
      const cfg: Record<
        string,
        { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
      > = {
        pending: { label: 'Pending', variant: 'outline' },
        approved: { label: 'Approved', variant: 'default' },
        rejected: { label: 'Rejected', variant: 'destructive' },
        cancelled: { label: 'Cancelled', variant: 'secondary' },
      }
      const c = cfg[status] ?? { label: status, variant: 'secondary' as const }
      return <Badge variant={c.variant}>{c.label}</Badge>
    },
  },
]

type FilterTab = 'my_review' | 'all_pending' | 'recent'

export function ChangeRequestQueue() {
  const [activeTab, setActiveTab] = React.useState<FilterTab>('my_review')
  const [requests, setRequests] = React.useState<ChangeRequestRow[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [stats, setStats] = React.useState({
    pending: 0,
    approvedToday: 0,
    rejectedToday: 0,
    oldestDays: 0,
  })
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.changeRequests.list.query({
          filter: activeTab,
          ...tableState,
        }) as Promise<{
          requests: ChangeRequestRow[]
          totalCount: number
          stats: typeof stats
        }>)
        setRequests(result.requests)
        setTotalCount(result.totalCount)
        setStats(result.stats)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [activeTab, tableState])

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-[#f7f8f8]">{stats.pending}</div>
          <div className="text-xs text-[#8a8f98]">Pending</div>
        </Card>
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-[#10b981]">{stats.approvedToday}</div>
          <div className="text-xs text-[#8a8f98]">Approved Today</div>
        </Card>
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-red-400">{stats.rejectedToday}</div>
          <div className="text-xs text-[#8a8f98]">Rejected Today</div>
        </Card>
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
          <div className="text-2xl font-[510] text-amber-400">{stats.oldestDays}d</div>
          <div className="text-xs text-[#8a8f98]">Oldest Pending</div>
        </Card>
      </div>

      {/* Filter tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="my_review">Pending My Review</TabsTrigger>
            <TabsTrigger value="all_pending">All Pending</TabsTrigger>
            <TabsTrigger value="recent">Recently Decided</TabsTrigger>
          </TabsList>

          {/* Batch actions */}
          {activeTab !== 'recent' && selectedIds.length > 0 && (
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" size="sm" className="gap-1">
                    <Check className="h-3.5 w-3.5" />
                    Approve ({selectedIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Selected Changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to approve {selectedIds.length} change request(s)?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Approve All</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button variant="outline" size="sm" className="gap-1">
                <X className="h-3.5 w-3.5" />
                Reject ({selectedIds.length})
              </Button>
            </div>
          )}
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <DataTable
            columns={columns}
            rows={requests}
            state={tableState}
            totalCount={totalCount}
            onStateChange={setTableState}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **4.2** Create `apps/web-people/src/app/change-requests/page.tsx`:

```tsx
// apps/web-people/src/app/change-requests/page.tsx
import { ChangeRequestQueue } from '../../components/change-requests/change-request-queue'

export default function ChangeRequestsPage() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Change Requests</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">Review and approve profile change requests.</p>
      </div>
      <ChangeRequestQueue />
    </main>
  )
}
```

- [ ] **4.3** Write `change-request-queue.spec.tsx` — renders stats, tab switching, batch action buttons appear on selection.

---

## Task 5 — Reports layout and sidebar (P8)

- [ ] **5.1** Create `apps/web-people/src/components/reports/reports-sidebar.tsx`:

```tsx
// apps/web-people/src/components/reports/reports-sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, CheckSquare, FileText, Clock, FileSignature } from 'lucide-react'

const reportLinks = [
  { href: '/reports/headcount', label: 'Headcount', icon: Users },
  { href: '/reports/completeness', label: 'Profile Completeness', icon: CheckSquare },
  { href: '/reports/documents', label: 'Document Compliance', icon: FileText },
  { href: '/reports/probation', label: 'Probation Tracker', icon: Clock },
  { href: '/reports/contracts', label: 'Contract Expiry', icon: FileSignature },
]

export function ReportsSidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-56 shrink-0 space-y-1">
      {reportLinks.map((link) => {
        const isActive = pathname === link.href
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              isActive
                ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]'
                : 'text-[#8a8f98] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#d0d6e0]'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **5.2** Create `apps/web-people/src/app/reports/layout.tsx`:

```tsx
// apps/web-people/src/app/reports/layout.tsx
import { ReportsSidebar } from '../../components/reports/reports-sidebar'

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Reports</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">HR analytics and compliance dashboards.</p>
      </div>
      <div className="flex gap-8">
        <ReportsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  )
}
```

- [ ] **5.3** Create `apps/web-people/src/app/reports/page.tsx` — redirects to `/reports/headcount`.
- [ ] **5.4** Create `apps/web-people/src/components/reports/summary-cards.tsx`:

```tsx
// apps/web-people/src/components/reports/summary-cards.tsx
'use client'

import { Card } from '@future/ui'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SummaryCardProps {
  label: string
  value: number | string
  trend?: 'up' | 'down' | 'flat'
  trendValue?: string
}

export function SummaryCard({ label, value, trend, trendValue }: SummaryCardProps) {
  return (
    <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
      <div className="text-xs font-[510] text-[#8a8f98] uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-3xl font-[510] text-[#f7f8f8]">{value}</div>
      {trend && trendValue && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-[#10b981]" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-400" />}
          {trend === 'flat' && <Minus className="h-3 w-3 text-[#62666d]" />}
          <span
            className={
              trend === 'up'
                ? 'text-[#10b981]'
                : trend === 'down'
                  ? 'text-red-400'
                  : 'text-[#62666d]'
            }
          >
            {trendValue}
          </span>
        </div>
      )}
    </Card>
  )
}

interface SummaryCardsRowProps {
  cards: SummaryCardProps[]
}

export function SummaryCardsRow({ cards }: SummaryCardsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}
    </div>
  )
}
```

---

## Task 6 — Report sub-pages (P8a-P8e)

- [ ] **6.1** Create `apps/web-people/src/app/reports/headcount/page.tsx`:

```tsx
// apps/web-people/src/app/reports/headcount/page.tsx
'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, Card, type FutureTableState, defaultTableState, Skeleton } from '@future/ui'
import { SummaryCardsRow } from '../../../components/reports/summary-cards'
import type { HeadcountSummary } from '../../../lib/types-workflows'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export default function HeadcountReportPage() {
  const [data, setData] = React.useState<HeadcountSummary | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [breakdownView, setBreakdownView] = React.useState<'department' | 'country' | 'type'>(
    'department',
  )
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.reports.headcount.query() as Promise<HeadcountSummary>)
        setData(result)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const breakdownData = {
    department: data.byDepartment.map((d) => ({ name: d.name, count: d.count })),
    country: data.byCountry.map((d) => ({ name: `${d.name} (${d.code})`, count: d.count })),
    type: data.byType.map((d) => ({ name: d.type, count: d.count })),
  }

  const breakdownColumns: ColumnDef<{ name: string; count: number }>[] = [
    { accessorKey: 'name', header: 'Name', enableSorting: true },
    { accessorKey: 'count', header: 'Count', enableSorting: true },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-[510] text-[#f7f8f8]">Headcount</h2>

      <SummaryCardsRow
        cards={[
          { label: 'Total Active', value: data.totalActive },
          {
            label: 'New Hires (month)',
            value: data.newHiresThisMonth,
            trend: 'up',
            trendValue: `+${data.newHiresThisMonth}`,
          },
          {
            label: 'Terminations (month)',
            value: data.terminationsThisMonth,
            trend: data.terminationsThisMonth > 0 ? 'down' : 'flat',
            trendValue: `-${data.terminationsThisMonth}`,
          },
          {
            label: 'Net Change',
            value: data.netChange > 0 ? `+${data.netChange}` : String(data.netChange),
            trend: data.netChange > 0 ? 'up' : data.netChange < 0 ? 'down' : 'flat',
            trendValue: '',
          },
        ]}
      />

      {/* Trend chart placeholder */}
      <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-5">
        <h3 className="text-sm font-[590] text-[#f7f8f8] mb-4">12-Month Trend</h3>
        <div className="h-48 flex items-end gap-1">
          {data.trend.map((point) => {
            const maxCount = Math.max(...data.trend.map((p) => p.count), 1)
            const height = (point.count / maxCount) * 100
            return (
              <div key={point.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[#5e6ad2]/60"
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] text-[#62666d]">{point.month.slice(5)}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Breakdown table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-[510] text-[#f7f8f8]">Breakdown by</span>
          {(['department', 'country', 'type'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setBreakdownView(view)}
              className={`px-2 py-1 text-xs rounded ${
                breakdownView === view
                  ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]'
                  : 'text-[#8a8f98] hover:text-[#d0d6e0]'
              }`}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
        <DataTable
          columns={breakdownColumns}
          rows={breakdownData[breakdownView]}
          state={tableState}
          totalCount={breakdownData[breakdownView].length}
          onStateChange={setTableState}
          isLoading={false}
        />
      </div>
    </div>
  )
}
```

- [ ] **6.2** Create `apps/web-people/src/app/reports/completeness/page.tsx` — DataTable with employee name, department, score (color-coded), missing count, days since hire. Filter by department, score threshold. "Send Reminders" bulk action.
- [ ] **6.3** Create `apps/web-people/src/app/reports/documents/page.tsx` — two sections: Expiring Documents DataTable (employee, title, category, expiry, days remaining color-coded) and Missing Documents DataTable (employee, required vs submitted). Filters: country, category, expiry window toggle (30/60/90 days).
- [ ] **6.4** Create `apps/web-people/src/app/reports/probation/page.tsx` — three sections: Active, Upcoming (next 30 days), Overdue. Each as a DataTable with employee, dates, days remaining, status badge.
- [ ] **6.5** Create `apps/web-people/src/app/reports/contracts/page.tsx` — Expiring contracts DataTable (employee, type, end date, days remaining). Filters: country, type, expiry window.

---

## Task 7 — Settings layout and sidebar (P9)

- [ ] **7.1** Create `apps/web-people/src/components/settings/settings-sidebar.tsx`:

```tsx
// apps/web-people/src/components/settings/settings-sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Briefcase,
  UserPlus,
  UserMinus,
  Globe,
  Sliders,
  Shield,
  Eye,
  Mail,
  BarChart3,
  FileUp,
} from 'lucide-react'

const settingsLinks = [
  { href: '/settings/job-catalog', label: 'Job Catalog', icon: Briefcase },
  { href: '/settings/onboarding-templates', label: 'Onboarding Templates', icon: UserPlus },
  { href: '/settings/offboarding-templates', label: 'Offboarding Templates', icon: UserMinus },
  { href: '/settings/countries', label: 'Country Configuration', icon: Globe },
  { href: '/settings/custom-fields', label: 'Custom Fields', icon: Sliders },
  { href: '/settings/edit-policies', label: 'Edit Policies', icon: Shield },
  { href: '/settings/visibility', label: 'Field Visibility', icon: Eye },
  { href: '/settings/email', label: 'Email Configuration', icon: Mail },
  { href: '/settings/completeness', label: 'Completeness Rules', icon: BarChart3 },
  { href: '/settings/import', label: 'Import / Export', icon: FileUp },
]

export function SettingsSidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-56 shrink-0 space-y-1">
      {settingsLinks.map((link) => {
        const isActive = pathname.startsWith(link.href)
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              isActive
                ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]'
                : 'text-[#8a8f98] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#d0d6e0]'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **7.2** Create `apps/web-people/src/app/settings/layout.tsx`:

```tsx
// apps/web-people/src/app/settings/layout.tsx
import { SettingsSidebar } from '../../components/settings/settings-sidebar'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Settings</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">
          Configure the people module for your organization.
        </p>
      </div>
      <div className="flex gap-8">
        <SettingsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  )
}
```

- [ ] **7.3** Create `apps/web-people/src/app/settings/page.tsx` — redirects to `/settings/job-catalog`.

---

## Task 8 — Settings: Job Catalog (P9a)

- [ ] **8.1** Create `apps/web-people/src/components/settings/job-catalog-editor.tsx`:

```tsx
// apps/web-people/src/components/settings/job-catalog-editor.tsx
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
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Plus, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react'
import type { JobFamily, JobProfileRow } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const profileColumns: ColumnDef<JobProfileRow>[] = [
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  { accessorKey: 'level', header: 'Level', enableSorting: true },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }: CellContext<JobProfileRow, unknown>) => (
      <Badge variant={getValue() ? 'default' : 'secondary'}>
        {getValue() ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    accessorKey: 'assignmentCount',
    header: 'Assignments',
    cell: ({ getValue }: CellContext<JobProfileRow, unknown>) => (
      <span className="text-xs text-[#8a8f98]">{getValue() as number}</span>
    ),
  },
]

export function JobCatalogEditor() {
  const [families, setFamilies] = React.useState<JobFamily[]>([])
  const [selectedFamilyId, setSelectedFamilyId] = React.useState<string | null>(null)
  const [profiles, setProfiles] = React.useState<JobProfileRow[]>([])
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.jobFamilies.list.query() as Promise<{
          families: JobFamily[]
        }>)
        setFamilies(result.families)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  React.useEffect(() => {
    if (!selectedFamilyId) {
      setProfiles([])
      return
    }
    void (async () => {
      try {
        const result = await (anyTrpc.people.settings.jobProfiles.list.query({
          familyId: selectedFamilyId,
        }) as Promise<{ profiles: JobProfileRow[] }>)
        setProfiles(result.profiles)
      } catch {
        setProfiles([])
      }
    })()
  }, [selectedFamilyId])

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderFamilyTree(items: JobFamily[], depth = 0) {
    return items.map((family) => {
      const isExpanded = expandedIds.has(family.id)
      const isSelected = selectedFamilyId === family.id
      const hasChildren = family.children && family.children.length > 0

      return (
        <div key={family.id}>
          <button
            type="button"
            onClick={() => {
              setSelectedFamilyId(family.id)
              if (hasChildren) toggleExpand(family.id)
            }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
              isSelected
                ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]'
                : 'text-[#d0d6e0] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )
            ) : (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#62666d]" />
            )}
            <span className="truncate">{family.name}</span>
            <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px]">
              {family.profileCount}
            </Badge>
          </button>
          {isExpanded && hasChildren && renderFamilyTree(family.children!, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="flex gap-6">
      {/* Family tree */}
      <Card className="w-64 shrink-0 border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-[590] text-[#f7f8f8]">Job Families</h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <div className="text-xs text-[#62666d] py-4 text-center">Loading...</div>
          ) : (
            renderFamilyTree(families)
          )}
        </div>
      </Card>

      {/* Profile table */}
      <div className="flex-1 min-w-0">
        {selectedFamilyId ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-[590] text-[#f7f8f8]">Job Profiles</h3>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm" className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Add Profile
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Job Profile</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Job title" />
                    <Input placeholder="Level (e.g., L1, Senior)" />
                    <Button className="w-full">Create</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <DataTable
              columns={profileColumns}
              rows={profiles}
              state={tableState}
              totalCount={profiles.length}
              onStateChange={setTableState}
              isLoading={false}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center py-16 text-sm text-[#62666d]">
            Select a job family to view profiles
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **8.2** Create `apps/web-people/src/app/settings/job-catalog/page.tsx`:

```tsx
// apps/web-people/src/app/settings/job-catalog/page.tsx
import { JobCatalogEditor } from '../../../components/settings/job-catalog-editor'

export default function JobCatalogPage() {
  return (
    <div>
      <h2 className="text-lg font-[510] text-[#f7f8f8] mb-4">Job Catalog</h2>
      <JobCatalogEditor />
    </div>
  )
}
```

---

## Task 9 — Settings: Onboarding/Offboarding Templates (P9b, P9c)

- [ ] **9.1** Create `apps/web-people/src/components/settings/template-editor.tsx`:

```tsx
// apps/web-people/src/components/settings/template-editor.tsx
'use client'

import * as React from 'react'
import {
  Card,
  Badge,
  Button,
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
  Switch,
} from '@future/ui'
import { Plus, GripVertical, Trash2, Copy } from 'lucide-react'
import type { OnboardingTemplate, TemplateTask } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TemplateEditorProps {
  type: 'onboarding' | 'offboarding'
}

export function TemplateEditor({ type }: TemplateEditorProps) {
  const [templates, setTemplates] = React.useState<OnboardingTemplate[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  const selectedTemplate = templates.find((t) => t.id === selectedId)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings[`${type}Templates`].list.query() as Promise<{
          templates: OnboardingTemplate[]
        }>)
        setTemplates(result.templates)
        if (result.templates.length > 0) setSelectedId(result.templates[0].id)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [type])

  return (
    <div className="flex gap-6">
      {/* Template list */}
      <Card className="w-64 shrink-0 border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-[590] text-[#f7f8f8]">Templates</h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-1">
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => setSelectedId(tmpl.id)}
              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-sm ${
                selectedId === tmpl.id
                  ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]'
                  : 'text-[#d0d6e0] hover:bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              <div className="truncate">
                {tmpl.name}
                {tmpl.isDefault && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    Default
                  </Badge>
                )}
              </div>
              <span className="text-xs text-[#62666d]">{tmpl.taskCount}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Template editor */}
      <div className="flex-1 min-w-0">
        {selectedTemplate ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-[590] text-[#f7f8f8]">{selectedTemplate.name}</h3>
                <div className="flex gap-2 mt-1">
                  {selectedTemplate.countryScope && (
                    <Badge variant="outline" className="text-xs">
                      {selectedTemplate.countryScope}
                    </Badge>
                  )}
                  {selectedTemplate.employmentTypeScope && (
                    <Badge variant="outline" className="text-xs">
                      {selectedTemplate.employmentTypeScope}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="default" size="sm" className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Add Task
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input placeholder="Task title" />
                      <Input placeholder="Description (optional)" />
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Assignee role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hr">HR</SelectItem>
                          <SelectItem value="it">IT</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="number" placeholder="Due days after start" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#d0d6e0]">Required</span>
                        <Switch />
                      </div>
                      <Button className="w-full">Add Task</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Task list with drag handles */}
            <div className="space-y-2">
              {selectedTemplate.tasks.map((task) => (
                <Card
                  key={task.id}
                  className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3"
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-[#62666d] cursor-grab shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#d0d6e0]">{task.title}</span>
                        {task.isRequired && (
                          <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                            Required
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#62666d] mt-0.5">
                        <span>{task.assigneeRole}</span>
                        <span>Due: +{task.dueDays} days</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-[#62666d] py-16 text-center">Select a template to edit</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **9.2** Create `apps/web-people/src/app/settings/onboarding-templates/page.tsx` and `offboarding-templates/page.tsx` using `<TemplateEditor type="onboarding" />` and `<TemplateEditor type="offboarding" />`.

---

## Task 10 — Settings: Country Configuration (P9d)

- [ ] **10.1** Create `apps/web-people/src/app/settings/countries/page.tsx` — DataTable listing countries with code, name, field count, probation policy count, document requirement count. Row click navigates to detail.
- [ ] **10.2** Create `apps/web-people/src/components/settings/country-config-tabs.tsx`:

```tsx
// apps/web-people/src/components/settings/country-config-tabs.tsx
'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
  Input,
  Switch,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Plus, GripVertical } from 'lucide-react'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface CountryConfigTabsProps {
  countryCode: string
  countryName: string
}

type CountryField = {
  id: string
  fieldKey: string
  label: string
  type: string
  group: string
  isRequired: boolean
  sortOrder: number
}

export function CountryConfigTabs({ countryCode, countryName }: CountryConfigTabsProps) {
  const [fields, setFields] = React.useState<CountryField[]>([])
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.countries.getConfig.query({
          countryCode,
        }) as Promise<{ fields: CountryField[] }>)
        setFields(result.fields)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [countryCode])

  const fieldColumns: ColumnDef<CountryField>[] = [
    { accessorKey: 'fieldKey', header: 'Field Key', enableSorting: true },
    { accessorKey: 'label', header: 'Label', enableSorting: true },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'group', header: 'Group' },
    {
      accessorKey: 'isRequired',
      header: 'Required',
      cell: ({ getValue }) => (getValue() ? 'Yes' : 'No'),
    },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-[510] text-[#f7f8f8]">
        {countryName} ({countryCode.toUpperCase()})
      </h2>

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="probation">Probation Policies</TabsTrigger>
          <TabsTrigger value="documents">Document Requirements</TabsTrigger>
          <TabsTrigger value="contracts">Contract Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="default" size="sm" className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add Field
            </Button>
          </div>
          <DataTable
            columns={fieldColumns}
            rows={fields}
            state={tableState}
            totalCount={fields.length}
            onStateChange={setTableState}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="probation" className="mt-4">
          <p className="text-sm text-[#8a8f98]">
            Probation policies for {countryName} — edit inline.
          </p>
          {/* Inline editable table placeholder */}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <p className="text-sm text-[#8a8f98]">Document requirements for {countryName}.</p>
          {/* DataTable with add/edit/remove */}
        </TabsContent>

        <TabsContent value="contracts" className="mt-4">
          <p className="text-sm text-[#8a8f98]">Contract policies for {countryName}.</p>
          {/* Inline editable form */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **10.3** Create `apps/web-people/src/app/settings/countries/[countryCode]/page.tsx` using `CountryConfigTabs`.

---

## Task 11 — Settings: Custom Fields (P9e)

- [ ] **11.1** Create `apps/web-people/src/components/settings/custom-field-dialog.tsx`:

```tsx
// apps/web-people/src/components/settings/custom-field-dialog.tsx
'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Button,
  Badge,
} from '@future/ui'
import type { CustomFieldDefinition } from '../../lib/types-workflows'

interface CustomFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field?: CustomFieldDefinition | null // null = create mode
  onSave: (data: Partial<CustomFieldDefinition>) => void
}

export function CustomFieldDialog({ open, onOpenChange, field, onSave }: CustomFieldDialogProps) {
  const isEdit = field != null
  const [label, setLabel] = React.useState(field?.label ?? '')
  const [fieldKey, setFieldKey] = React.useState(field?.fieldKey ?? '')
  const [type, setType] = React.useState(field?.type ?? 'text')
  const [group, setGroup] = React.useState(field?.group ?? '')
  const [isRequired, setIsRequired] = React.useState(field?.isRequired ?? false)
  const [isSearchable, setIsSearchable] = React.useState(field?.isSearchable ?? false)
  const [isFilterable, setIsFilterable] = React.useState(field?.isFilterable ?? false)
  const [visibilityTier, setVisibilityTier] = React.useState(field?.visibilityTier ?? 'restricted')
  const [options, setOptions] = React.useState(field?.options?.join(', ') ?? '')

  // Auto-generate key from label (create mode only)
  React.useEffect(() => {
    if (!isEdit && label) {
      setFieldKey(
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, ''),
      )
    }
  }, [label, isEdit])

  function handleSubmit() {
    onSave({
      label,
      fieldKey,
      type: type as CustomFieldDefinition['type'],
      group,
      isRequired,
      isSearchable,
      isFilterable,
      visibilityTier: visibilityTier as CustomFieldDefinition['visibilityTier'],
      options:
        type === 'select' || type === 'multi_select'
          ? options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : null,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., T-Shirt Size"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Field Key</label>
            <Input
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              disabled={isEdit}
              className={isEdit ? 'opacity-50' : ''}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="select">Select</SelectItem>
                <SelectItem value="multi_select">Multi-Select</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(type === 'select' || type === 'multi_select') && (
            <div className="space-y-1">
              <label className="text-xs font-[510] text-[#8a8f98]">Options (comma-separated)</label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Small, Medium, Large"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Group</label>
            <Input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="e.g., Preferences"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-[510] text-[#8a8f98]">Visibility Tier</label>
            <Select value={visibilityTier} onValueChange={setVisibilityTier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#d0d6e0]">Required</span>
              <Switch checked={isRequired} onCheckedChange={setIsRequired} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#d0d6e0]">Searchable</span>
              <Switch checked={isSearchable} onCheckedChange={setIsSearchable} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#d0d6e0]">Filterable</span>
              <Switch checked={isFilterable} onCheckedChange={setIsFilterable} />
            </div>
          </div>
          <Button className="w-full" onClick={handleSubmit}>
            {isEdit ? 'Save Changes' : 'Create Field'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **11.2** Create `apps/web-people/src/app/settings/custom-fields/page.tsx` — DataTable with columns: key, label, type, group, required, searchable, filterable, visibility tier badge, active status. Add button opens `CustomFieldDialog`. Edit button per row opens dialog in edit mode.

---

## Task 12 — Settings: Edit Policies + Field Visibility (P9f, P9g)

- [ ] **12.1** Create `apps/web-people/src/components/settings/field-policy-list.tsx`:

```tsx
// apps/web-people/src/components/settings/field-policy-list.tsx
'use client'

import * as React from 'react'
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@future/ui'
import type { FieldPolicyEntry, FieldVisibilityEntry } from '../../lib/types-workflows'

type EditPolicyMode = 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'
type VisibilityTier = 'public' | 'restricted' | 'confidential'

const editModeConfig: Record<
  EditPolicyMode,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  self_service: { label: 'Self-service', variant: 'default' },
  manager_approval: { label: 'Manager Approval', variant: 'outline' },
  hr_approval: { label: 'HR Approval', variant: 'secondary' },
  hr_only: { label: 'HR Only', variant: 'destructive' },
}

const tierConfig: Record<
  VisibilityTier,
  { label: string; variant: 'default' | 'outline' | 'destructive' }
> = {
  public: { label: 'Public', variant: 'default' },
  restricted: { label: 'Restricted', variant: 'outline' },
  confidential: { label: 'Confidential', variant: 'destructive' },
}

interface FieldPolicyListProps {
  mode: 'edit_policy' | 'visibility'
  entries: Array<FieldPolicyEntry | FieldVisibilityEntry>
  onChange: (fieldPath: string, value: string) => void
}

export function FieldPolicyList({ mode, entries, onChange }: FieldPolicyListProps) {
  const grouped = entries.reduce<Record<string, typeof entries>>((acc, entry) => {
    const section = entry.section || 'Other'
    if (!acc[section]) acc[section] = []
    acc[section].push(entry)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([section, sectionEntries]) => (
        <div key={section}>
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-3 capitalize">{section}</h3>
          <div className="space-y-1">
            {sectionEntries.map((entry) => (
              <div
                key={entry.fieldPath}
                className="flex items-center justify-between rounded-md border border-[rgba(255,255,255,0.05)] px-3 py-2"
              >
                <div className="text-sm text-[#d0d6e0]">{entry.fieldLabel}</div>
                {mode === 'edit_policy' ? (
                  <Select
                    value={(entry as FieldPolicyEntry).editMode}
                    onValueChange={(val) => onChange(entry.fieldPath, val)}
                  >
                    <SelectTrigger className="w-48 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(editModeConfig).map(([value, cfg]) => (
                        <SelectItem key={value} value={value}>
                          <Badge variant={cfg.variant} className="text-xs">
                            {cfg.label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={(entry as FieldVisibilityEntry).tier}
                    onValueChange={(val) => onChange(entry.fieldPath, val)}
                  >
                    <SelectTrigger className="w-40 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(tierConfig).map(([value, cfg]) => (
                        <SelectItem key={value} value={value}>
                          <Badge variant={cfg.variant} className="text-xs">
                            {cfg.label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **12.2** Create `apps/web-people/src/app/settings/edit-policies/page.tsx` and `apps/web-people/src/app/settings/visibility/page.tsx` using `FieldPolicyList` with the appropriate mode.

---

## Task 13 — Settings: Email Configuration (P9h)

- [ ] **13.1** Create `apps/web-people/src/app/settings/email/page.tsx` — form with domain input, pattern select (with live preview: "an.nguyen@domain"), transliteration mode toggle. "Test Generator" section: enter a Vietnamese name, see generated email candidates.

---

## Task 14 — Settings: Completeness Rules (P9i)

- [ ] **14.1** Create `apps/web-people/src/app/settings/completeness/page.tsx` — DataTable with field path, label, section, weight, required toggle, country scope, deadline days. Add/edit/remove actions. "Test Score" feature: select an employee, see computed score with current ruleset.

---

## Task 15 — Settings: Import/Export (P9j)

- [ ] **15.1** Create `apps/web-people/src/components/settings/import-wizard.tsx`:

```tsx
// apps/web-people/src/components/settings/import-wizard.tsx
'use client'

import * as React from 'react'
import {
  Card,
  Button,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Progress,
} from '@future/ui'
import { Upload, Download, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

type WizardStep = 'upload' | 'mapping' | 'validation' | 'preview' | 'processing'

interface ColumnMapping {
  sourceHeader: string
  targetField: string | null
  suggested: string | null
}

export function ImportWizard() {
  const [step, setStep] = React.useState<WizardStep>('upload')
  const [file, setFile] = React.useState<File | null>(null)
  const [mappings, setMappings] = React.useState<ColumnMapping[]>([])
  const [validationResult, setValidationResult] = React.useState<{
    valid: number
    errors: number
    warnings: number
    errorRows: Array<{ row: number; field: string; message: string; severity: 'error' | 'warning' }>
  } | null>(null)
  const [progress, setProgress] = React.useState(0)

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['upload', 'mapping', 'validation', 'preview', 'processing'] as WizardStep[]).map(
          (s, i) => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center gap-1 text-xs font-[510] ${
                  step === s
                    ? 'text-[#7170ff]'
                    : i < ['upload', 'mapping', 'validation', 'preview', 'processing'].indexOf(step)
                      ? 'text-[#10b981]'
                      : 'text-[#62666d]'
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                    step === s
                      ? 'bg-[#5e6ad2] text-white'
                      : i <
                          ['upload', 'mapping', 'validation', 'preview', 'processing'].indexOf(step)
                        ? 'bg-[#10b981]/20 text-[#10b981]'
                        : 'bg-[rgba(255,255,255,0.05)] text-[#62666d]'
                  }`}
                >
                  {i + 1}
                </div>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {i < 4 && <div className="h-px w-8 bg-[rgba(255,255,255,0.08)]" />}
            </React.Fragment>
          ),
        )}
      </div>

      {/* Step content */}
      {step === 'upload' && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-lg border-2 border-dashed border-[rgba(255,255,255,0.08)] p-12 w-full text-center">
              <Upload className="mx-auto h-10 w-10 text-[#62666d] mb-3" />
              <p className="text-sm text-[#d0d6e0] mb-1">Drop CSV or XLSX file here</p>
              <p className="text-xs text-[#62666d]">Maximum 10MB</p>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                id="import-file"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setFile(e.target.files[0])
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => document.getElementById('import-file')?.click()}
              >
                Browse Files
              </Button>
            </div>
            {file && (
              <div className="flex items-center justify-between w-full">
                <span className="text-sm text-[#d0d6e0]">
                  {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </span>
                <Button variant="default" size="sm" onClick={() => setStep('mapping')}>
                  Continue
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 'mapping' && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6">
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-4">Column Mapping</h3>
          <p className="text-xs text-[#8a8f98] mb-4">Map detected headers to system fields.</p>
          <div className="space-y-2">
            {mappings.map((mapping, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-48 text-sm text-[#d0d6e0] truncate">{mapping.sourceHeader}</div>
                <span className="text-[#62666d]">-&gt;</span>
                <Select
                  value={mapping.targetField ?? ''}
                  onValueChange={(val) => {
                    const next = [...mappings]
                    next[i] = { ...next[i], targetField: val || null }
                    setMappings(next)
                  }}
                >
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Skip</SelectItem>
                    <SelectItem value="family_name">Family Name</SelectItem>
                    <SelectItem value="given_name">Given Name</SelectItem>
                    <SelectItem value="company_email">Company Email</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="job_title">Job Title</SelectItem>
                    <SelectItem value="country_code">Country</SelectItem>
                    <SelectItem value="hire_date">Hire Date</SelectItem>
                  </SelectContent>
                </Select>
                {mapping.suggested && (
                  <Badge variant="secondary" className="text-[10px]">
                    Suggested
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button variant="default" size="sm" onClick={() => setStep('validation')}>
              Validate
            </Button>
          </div>
        </Card>
      )}

      {step === 'validation' && validationResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
              <CheckCircle2 className="mx-auto h-5 w-5 text-[#10b981] mb-1" />
              <div className="text-lg font-[510] text-[#10b981]">{validationResult.valid}</div>
              <div className="text-xs text-[#8a8f98]">Valid</div>
            </Card>
            <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
              <XCircle className="mx-auto h-5 w-5 text-red-400 mb-1" />
              <div className="text-lg font-[510] text-red-400">{validationResult.errors}</div>
              <div className="text-xs text-[#8a8f98]">Errors</div>
            </Card>
            <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-amber-400 mb-1" />
              <div className="text-lg font-[510] text-amber-400">{validationResult.warnings}</div>
              <div className="text-xs text-[#8a8f98]">Warnings</div>
            </Card>
          </div>
          {validationResult.errorRows.length > 0 && (
            <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-[590] text-[#f7f8f8]">Issues</h3>
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-3.5 w-3.5" />
                  Download Error Report
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {validationResult.errorRows.map((err, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-xs py-1 border-b border-[rgba(255,255,255,0.05)]"
                  >
                    <Badge
                      variant={err.severity === 'error' ? 'destructive' : 'outline'}
                      className="text-[10px] h-4"
                    >
                      {err.severity}
                    </Badge>
                    <span className="text-[#62666d]">Row {err.row}</span>
                    <span className="text-[#8a8f98]">{err.field}</span>
                    <span className="text-[#d0d6e0]">{err.message}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep('mapping')}>
              Back
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setStep('preview')}
              disabled={validationResult.errors > 0}
            >
              Preview
            </Button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8 text-center">
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-4">Processing Import</h3>
          <Progress value={progress} className="h-2 max-w-md mx-auto mb-4" />
          <p className="text-xs text-[#8a8f98]">{progress}% complete</p>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **15.2** Create `apps/web-people/src/app/settings/import/page.tsx` with two sections: Import (using `ImportWizard`) and Export (column picker with checkbox list, format select, export button).
- [ ] **15.3** Write `import-wizard.spec.tsx` — step navigation, file upload state, validation result display.

---

## Task 16 — Shared Profile page (P10)

- [ ] **16.1** Create `apps/web-people/src/app/shared/profile/[token]/layout.tsx`:

```tsx
// apps/web-people/src/app/shared/profile/[token]/layout.tsx
export default function SharedProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#08090a] text-[#f7f8f8]">{children}</body>
    </html>
  )
}
```

- [ ] **16.2** Create `apps/web-people/src/app/shared/profile/[token]/page.tsx`:

```tsx
// apps/web-people/src/app/shared/profile/[token]/page.tsx
'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Card, Badge, Skeleton } from '@future/ui'
import { trpc } from '../../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type SharedProfile = {
  fullName: string
  avatarUrl: string | null
  jobTitle: string
  department: string
  companyName: string
  companyEmail: string
  workArrangement: string | null
  location: string | null
  skills: string[]
  education: Array<{ institution: string; degree: string; year: string }>
  certifications: Array<{ name: string; issuer: string; year: string }>
  socialLinks: Array<{ platform: string; url: string }>
  expiresAt: string | null
}

export default function SharedProfilePage() {
  const params = useParams()
  const token = params.token as string
  const [profile, setProfile] = React.useState<SharedProfile | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.sharedProfile.get.query({
          token,
        }) as Promise<{ profile: SharedProfile }>)
        setProfile(result.profile)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Invalid or expired link')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [token])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-lg" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8 text-center max-w-md">
          <p className="text-sm text-[#8a8f98]">{error ?? 'Profile not found'}</p>
        </Card>
      </div>
    )
  }

  const initials = profile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4">
      {/* Company branding */}
      <div className="text-sm font-[510] text-[#8a8f98] mb-8">{profile.companyName}</div>

      <Card className="w-full max-w-lg border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-xl font-[510] text-[#d0d6e0] mb-4">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">
            {profile.fullName}
          </h1>
          <div className="text-sm text-[#8a8f98] mt-1">{profile.jobTitle}</div>
          <div className="text-sm text-[#62666d]">{profile.department}</div>
        </div>

        {/* Contact */}
        <div className="space-y-2 mb-6">
          <div className="text-xs text-[#62666d] uppercase font-[510]">Contact</div>
          <div className="text-sm text-[#d0d6e0]">{profile.companyEmail}</div>
          {profile.location && <div className="text-sm text-[#8a8f98]">{profile.location}</div>}
          {profile.workArrangement && (
            <Badge variant="outline">{profile.workArrangement.replace('_', ' ')}</Badge>
          )}
        </div>

        {/* Skills */}
        {profile.skills.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Skills</div>
            <div className="flex flex-wrap gap-1">
              {profile.skills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {profile.education.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Education</div>
            {profile.education.map((edu, i) => (
              <div key={i} className="mb-2">
                <div className="text-sm text-[#d0d6e0]">{edu.degree}</div>
                <div className="text-xs text-[#8a8f98]">
                  {edu.institution}, {edu.year}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Certifications */}
        {profile.certifications.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Certifications</div>
            {profile.certifications.map((cert, i) => (
              <div key={i} className="mb-2">
                <div className="text-sm text-[#d0d6e0]">{cert.name}</div>
                <div className="text-xs text-[#8a8f98]">
                  {cert.issuer}, {cert.year}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Social Links */}
        {profile.socialLinks.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Links</div>
            {profile.socialLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-[#7170ff] hover:text-[#828fff] mb-1"
              >
                {link.platform}
              </a>
            ))}
          </div>
        )}

        {/* Token expiry warning */}
        {profile.expiresAt &&
          (() => {
            const daysLeft = Math.ceil(
              (new Date(profile.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )
            if (daysLeft <= 7) {
              return (
                <div className="text-xs text-amber-400 text-center mt-4">
                  This profile link expires in {daysLeft} day(s).
                </div>
              )
            }
            return null
          })()}
      </Card>

      <div className="mt-6 text-xs text-[#62666d]">
        This profile was shared by {profile.companyName}
      </div>
    </div>
  )
}
```

---

## Task 17 — Bulk Operations page (P11)

- [ ] **17.1** Create `apps/web-people/src/components/bulk/bulk-wizard.tsx`:

```tsx
// apps/web-people/src/components/bulk/bulk-wizard.tsx
'use client'

import * as React from 'react'
import {
  Card,
  Button,
  Badge,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@future/ui'
import { Building2, Users, ToggleLeft, ArrowRight } from 'lucide-react'
import { BulkEmployeeSelector } from './bulk-employee-selector'
import { BulkPreviewTable } from './bulk-preview-table'
import type { BulkOperationType, BulkPreviewRow } from '../../lib/types-workflows'

type WizardStep = 'operation' | 'employees' | 'configure' | 'preview' | 'confirm'

const operations: Array<{
  type: BulkOperationType
  title: string
  description: string
  icon: typeof Building2
}> = [
  {
    type: 'change_department',
    title: 'Change Department',
    description: 'Move selected employees to a new department',
    icon: Building2,
  },
  {
    type: 'change_manager',
    title: 'Change Manager',
    description: 'Assign a new manager to selected employees',
    icon: Users,
  },
  {
    type: 'change_status',
    title: 'Change Status',
    description: 'Update employment status for selected employees',
    icon: ToggleLeft,
  },
]

export function BulkWizard() {
  const [step, setStep] = React.useState<WizardStep>('operation')
  const [operation, setOperation] = React.useState<BulkOperationType | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [config, setConfig] = React.useState<Record<string, string>>({})
  const [preview, setPreview] = React.useState<BulkPreviewRow[]>([])
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [progress, setProgress] = React.useState(0)

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['operation', 'employees', 'configure', 'preview', 'confirm'] as WizardStep[]).map(
          (s, i) => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center gap-1 text-xs font-[510] ${
                  step === s
                    ? 'text-[#7170ff]'
                    : i <
                        ['operation', 'employees', 'configure', 'preview', 'confirm'].indexOf(step)
                      ? 'text-[#10b981]'
                      : 'text-[#62666d]'
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                    step === s
                      ? 'bg-[#5e6ad2] text-white'
                      : i <
                          ['operation', 'employees', 'configure', 'preview', 'confirm'].indexOf(
                            step,
                          )
                        ? 'bg-[#10b981]/20 text-[#10b981]'
                        : 'bg-[rgba(255,255,255,0.05)] text-[#62666d]'
                  }`}
                >
                  {i + 1}
                </div>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
              {i < 4 && <div className="h-px w-8 bg-[rgba(255,255,255,0.08)]" />}
            </React.Fragment>
          ),
        )}
      </div>

      {/* Step 1: Select operation */}
      {step === 'operation' && (
        <div className="grid grid-cols-3 gap-4">
          {operations.map((op) => {
            const Icon = op.icon
            return (
              <Card
                key={op.type}
                className={`cursor-pointer border p-6 text-center transition-colors ${
                  operation === op.type
                    ? 'border-[#7170ff] bg-[rgba(113,112,255,0.04)]'
                    : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)]'
                }`}
                onClick={() => setOperation(op.type)}
              >
                <Icon className="mx-auto h-8 w-8 text-[#8a8f98] mb-3" />
                <div className="text-sm font-[510] text-[#f7f8f8]">{op.title}</div>
                <div className="text-xs text-[#62666d] mt-1">{op.description}</div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Step 2: Select employees */}
      {step === 'employees' && (
        <BulkEmployeeSelector selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      )}

      {/* Step 3: Configure */}
      {step === 'configure' && operation && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-6 max-w-md">
          <h3 className="text-sm font-[590] text-[#f7f8f8] mb-4">
            Configure: {operations.find((o) => o.type === operation)?.title}
          </h3>
          {operation === 'change_department' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">New Department</label>
                <Select onValueChange={(val) => setConfig({ ...config, departmentId: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eng">Engineering</SelectItem>
                    <SelectItem value="hr">Human Resources</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">Effective Date</label>
                <Input
                  type="date"
                  onChange={(e) => setConfig({ ...config, effectiveDate: e.target.value })}
                />
              </div>
            </div>
          )}
          {operation === 'change_manager' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">New Manager</label>
                <Input
                  placeholder="Search by name..."
                  onChange={(e) => setConfig({ ...config, managerId: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">Effective Date</label>
                <Input
                  type="date"
                  onChange={(e) => setConfig({ ...config, effectiveDate: e.target.value })}
                />
              </div>
            </div>
          )}
          {operation === 'change_status' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-[510] text-[#8a8f98]">New Status</label>
                <Select onValueChange={(val) => setConfig({ ...config, status: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Preview */}
      {step === 'preview' && <BulkPreviewTable rows={preview} />}

      {/* Step 5: Confirm */}
      {step === 'confirm' && (
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8 text-center max-w-md mx-auto">
          {isProcessing ? (
            <div className="space-y-4">
              <h3 className="text-sm font-[590] text-[#f7f8f8]">Processing</h3>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-[#8a8f98]">{progress}% complete</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-[590] text-[#f7f8f8]">Ready to Execute</h3>
              <p className="text-sm text-[#8a8f98]">
                {selectedIds.length} employees will be updated.
              </p>
              <Button variant="default" onClick={() => setIsProcessing(true)}>
                Execute Changes
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Navigation buttons */}
      {!isProcessing && (
        <div className="flex justify-between">
          {step !== 'operation' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const steps: WizardStep[] = [
                  'operation',
                  'employees',
                  'configure',
                  'preview',
                  'confirm',
                ]
                const idx = steps.indexOf(step)
                if (idx > 0) setStep(steps[idx - 1])
              }}
            >
              Back
            </Button>
          )}
          {step !== 'confirm' && (
            <Button
              variant="default"
              size="sm"
              className="ml-auto gap-1"
              disabled={
                (step === 'operation' && !operation) ||
                (step === 'employees' && selectedIds.length === 0)
              }
              onClick={() => {
                const steps: WizardStep[] = [
                  'operation',
                  'employees',
                  'configure',
                  'preview',
                  'confirm',
                ]
                const idx = steps.indexOf(step)
                if (idx < steps.length - 1) setStep(steps[idx + 1])
              }}
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **17.2** Create `apps/web-people/src/components/bulk/bulk-employee-selector.tsx` — reuses the directory DataTable with checkbox selection. Supports pasting employee codes as alternative input.
- [ ] **17.3** Create `apps/web-people/src/components/bulk/bulk-preview-table.tsx` — DataTable showing each employee, current value, new value, validation errors (highlighted red).
- [ ] **17.4** Create `apps/web-people/src/app/bulk/page.tsx`:

```tsx
// apps/web-people/src/app/bulk/page.tsx
import { BulkWizard } from '../../components/bulk/bulk-wizard'

export default function BulkOperationsPage() {
  return (
    <main className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">Bulk Operations</h1>
        <p className="mt-1 text-sm text-[#8a8f98]">Apply changes to multiple employees at once.</p>
      </div>
      <BulkWizard />
    </main>
  )
}
```

- [ ] **17.5** Write `bulk-wizard.spec.tsx` — step navigation, operation selection, disable continue when no selection.

---

## Task 18 — Remaining settings pages (stubs with full structure)

- [ ] **18.1** Create `apps/web-people/src/app/settings/email/page.tsx` — form with domain input, pattern select with live preview, transliteration mode. Test generator section.
- [ ] **18.2** Create `apps/web-people/src/app/settings/completeness/page.tsx` — DataTable of rules + "Test Score" feature.
- [ ] **18.3** Verify all routes are accessible by running `bun run --filter web-people build`.

---

## Task 19 — Write remaining tests

- [ ] **19.1** Write `apps/web-people/src/components/onboarding/onboarding-cases-table.spec.tsx`.
- [ ] **19.2** Write `apps/web-people/src/components/change-requests/change-request-queue.spec.tsx` — renders stats, tabs, batch actions.
- [ ] **19.3** Write `apps/web-people/src/components/settings/import-wizard.spec.tsx` — step navigation, file state.
- [ ] **19.4** Write `apps/web-people/src/components/bulk/bulk-wizard.spec.tsx` — step navigation, operation selection.
