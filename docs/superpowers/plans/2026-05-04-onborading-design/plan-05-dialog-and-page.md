# Plan 5 — Frontend: NewOnboardingDialog + Page Update

**Spec:** `docs/superpowers/specs/2026-05-04-onboarding-design.md`
**Depends on:** Plan 3 (`startCase` tRPC endpoint), Plan 4 (`OnboardingKanban` component)
**Blocks:** nothing — final plan

---

## Goal

Build the "New onboarding" dialog and update `onboarding/page.tsx` to replace the old tab layout
with the Kanban board and the creation dialog.

---

## Steps

### 5.1 — Create `NewOnboardingDialog.tsx`

**File:** `apps/web-people/src/components/onboarding/NewOnboardingDialog.tsx`

Mark `'use client'` at top.

**Imports required:**

```ts
import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Spinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Combobox,
} from '@future/ui'
import { trpc } from '../../lib/trpc'
import type { OnboardingTemplate } from '../../lib/types-workflows'
// import toast from the same source used in other web-people components
```

**Props interface:**

```ts
interface NewOnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}
```

**State:**

```ts
const [employmentId, setEmploymentId] = React.useState('')
const [templateId, setTemplateId] = React.useState('')
const [employeeError, setEmployeeError] = React.useState<string | null>(null)
const [templateError, setTemplateError] = React.useState<string | null>(null)
const [isPending, setIsPending] = React.useState(false)
const [employments, setEmployments] = React.useState<Array<{ value: string; label: string }>>([])
const [templates, setTemplates] = React.useState<OnboardingTemplate[]>([])
```

**Load data when dialog opens** (`useEffect` gated by `open === true`):

```ts
React.useEffect(() => {
  if (!open) return
  void (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTrpc = trpc as any
    const [emps, tmpls] = await Promise.all([
      // These are non-DB fetches (external API calls), so Promise.all is allowed here.
      anyTrpc.people.listEmployments.query({ tenantId }),
      anyTrpc.people.listOnboardingTemplates.query({ tenantId }),
    ])
    setEmployments(emps.map((e: any) => ({ value: e.id, label: e.fullName })))
    setTemplates(tmpls)
    if (tmpls.length === 1) setTemplateId(tmpls[0].id)
  })()
}, [open])
```

> Note: `Promise.all` is permitted here because these are external tRPC calls (HTTP), not
> single-client DB queries. The no-`Promise.all` rule applies to DB calls inside command/query
> handlers only.

**Submit handler:**

```ts
async function handleSubmit() {
  setEmployeeError(null)
  setTemplateError(null)
  setIsPending(true)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTrpc = trpc as any
    await anyTrpc.people.onboarding.startCase.mutate({
      tenantId,
      actorId,
      employmentId,
      templateId: templateId || undefined,
    })
    onSuccess()
    toast({ title: 'Onboarding started' })
  } catch (err: unknown) {
    const code = (err as { data?: { code?: string } })?.data?.code
    if (code === 'ONBOARDING_CASE_ALREADY_EXISTS') {
      setEmployeeError('This employee already has an active onboarding case.')
    } else if (code === 'NO_ONBOARDING_TEMPLATE') {
      setTemplateError('No template found. Configure an onboarding template in Settings.')
    } else {
      toast({ title: 'Something went wrong', variant: 'destructive' })
    }
  } finally {
    setIsPending(false)
  }
}
```

**JSX:**

```tsx
export function NewOnboardingDialog({ open, onOpenChange, onSuccess }: NewOnboardingDialogProps) {
  // ... state and handlers above ...

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New onboarding</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee */}
          <div className="space-y-1.5">
            <label className="text-sm font-510 text-fg-primary">Employee</label>
            <Combobox
              options={employments}
              value={employmentId}
              onValueChange={setEmploymentId}
              placeholder="Search employee..."
            />
            {employeeError && <p className="text-xs text-destructive">{employeeError}</p>}
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <label className="text-sm font-510 text-fg-primary">Onboarding template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateError && <p className="text-xs text-destructive">{templateError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!employmentId || isPending}>
            {isPending && <Spinner className="size-4 mr-1.5" />}
            Start onboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

> **`tenantId` and `actorId`:** Source these from the session using the same pattern as other
> web-people components. Do not hardcode.

---

### 5.2 — Update `onboarding/page.tsx`

**File:** `apps/web-people/src/app/onboarding/page.tsx`

Remove all existing imports and body. Replace with:

```tsx
'use client'

import * as React from 'react'
import { Button } from '@future/ui'
import { Plus } from '@future/ui/icons'
import { OnboardingKanban } from '../../components/onboarding/OnboardingKanban'
import { NewOnboardingDialog } from '../../components/onboarding/NewOnboardingDialog'

export default function OnboardingPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Onboarding</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-1.5" /> New onboarding
        </Button>
      </div>

      <OnboardingKanban key={refreshKey} onAddClick={() => setDialogOpen(true)} />

      <NewOnboardingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          setDialogOpen(false)
          setRefreshKey((k) => k + 1)
        }}
      />
    </main>
  )
}
```

> `key={refreshKey}` remounts `OnboardingKanban` after a successful creation, forcing a fresh
> fetch without needing query invalidation wiring across component boundaries.

---

### 5.3 — Spec: `NewOnboardingDialog.spec.tsx`

**File:** `apps/web-people/src/components/onboarding/NewOnboardingDialog.spec.tsx`

Mock `trpc` with `vi.mock`. Setup mock data for `listEmployments`, `listOnboardingTemplates`,
and `startCase.mutate`.

Tests:

- **Test 1** — `renders employee and template fields when open`:
  `open={true}`, assert both the employee combobox and template select are visible.

- **Test 2** — `calls startCase with correct payload on submit`:
  Select an employee and template. Click "Start onboarding". Assert `startCase.mutate` called
  with `{ employmentId: 'emp-1', templateId: 'tmpl-1', tenantId: ..., actorId: ... }`.

- **Test 3** — `shows inline error for OnboardingCaseAlreadyExistsException`:
  Mock `startCase.mutate` to throw `{ data: { code: 'ONBOARDING_CASE_ALREADY_EXISTS' } }`.
  Submit form. Assert error text "This employee already has an active onboarding case." visible
  below the employee field.

- **Test 4** — `shows inline error for NoOnboardingTemplateException`:
  Mock throws `{ data: { code: 'NO_ONBOARDING_TEMPLATE' } }`.
  Assert error text visible below template field.

- **Test 5** — `calls onSuccess and closes on successful submit`:
  Mock `startCase.mutate` resolves. Assert `onSuccess` prop was called.

- **Test 6** — `pre-selects template when only one exists`:
  `listOnboardingTemplates` returns one template. Assert template select already has that
  template selected without user interaction.

---

## Risks

- Verify the `Combobox` component API from `@future/ui` — specifically the prop names
  (`options`, `value`, `onValueChange`) before implementing. Adjust if different.
- The `listEmployments` endpoint may return a paginated shape — check the response type and
  map to `{ value, label }` accordingly.
- Remove `WorkflowCasesTable` and `WorkflowMyTasks` imports cleanly — run TypeScript after to
  confirm no orphaned imports remain.
