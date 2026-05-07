# Onboarding Kanban — Design Spec

**Date:** 2026-05-04
**Zone:** `apps/web-people`
**Module:** `apps/api/src/modules/people`

---

## Summary

Replace the existing tab-based onboarding page (DataTable + My Tasks) with a Kanban board matching the design spec in `docs/raws/design/project/people/workflows.jsx`. Add real backend data via a `listCases` query and a `startCase` command. The "New onboarding" button opens a dialog to create a new onboarding case.

---

## Decisions

| Question                | Answer                                                |
| ----------------------- | ----------------------------------------------------- |
| Page layout             | Kanban only — no tabs, no My Tasks                    |
| Backend data            | Real — no stubs                                       |
| Stage source            | Explicit `stage` column on `onboarding_case` DB table |
| "New onboarding" button | Functional — opens a Dialog                           |

---

## 1. Database Schema

### Change: add `stage` to `onboarding_case`

```sql
stage text NOT NULL DEFAULT 'offer_accepted'
  CHECK (stage IN ('offer_accepted', 'paperwork', 'equipment', 'first_day_ready'))
```

**Drizzle** (`people.schema.ts`):

```ts
stage: text('stage', {
  enum: ['offer_accepted', 'paperwork', 'equipment', 'first_day_ready'],
}).notNull().default('offer_accepted'),
```

**Migration rule:** squash into `0000_initial.sql`. Delete existing `.sql` files + `meta/` snapshots, regenerate, rebuild DB.

---

## 2. Domain

### `onboarding-case.entity.ts`

Add type:

```ts
export type OnboardingCaseStage = 'offer_accepted' | 'paperwork' | 'equipment' | 'first_day_ready'
```

Add field to `OnboardingCase` interface:

```ts
stage: OnboardingCaseStage
```

### `IOnboardingCaseRepository` — new method

```ts
updateStage(id: string, tenantId: string, stage: OnboardingCaseStage): Promise<void>
```

Wired now for completeness; no tRPC route exposes it in this iteration.

### New exceptions (`people.exceptions.ts`)

```ts
export class OnboardingCaseAlreadyExistsException extends PeopleException { ... }
export class NoOnboardingTemplateException extends PeopleException { ... }
```

---

## 3. Application Layer

### `ListOnboardingCasesQuery`

**File:** `application/queries/list-onboarding-cases.query.ts`

```ts
export class ListOnboardingCasesQuery {
  constructor(public readonly tenantId: string) {}
}
```

**Dependencies injected:** `IOnboardingCaseRepository`, `IEmploymentRepository`, `IPersonProfileRepository`

**Handler** (`list-onboarding-cases.handler.ts`) — sequential DB calls (no `Promise.all`):

1. Fetch all `onboarding_case` rows where `tenantId` matches and `status = 'in_progress'`
2. For each case ID, fetch task aggregates:
   - `tasksTotal`: count of all tasks for the case
   - `tasksCompleted`: count where `status = 'completed'`
   - `blockers`: count where `status = 'pending'` AND `isRequired = true` AND `dueDate < now()`
3. Fetch `Employment` rows via `IEmploymentRepository.findManyByIds` for the collected `employmentId`s
4. Fetch `PersonProfile` rows via `IPersonProfileRepository.findManyByIds` for the collected `personProfileId`s from step 3

**Return type** `OnboardingCaseListItem`:

```ts
{
  id: string
  employmentId: string
  employeeName: string
  jobTitle: string
  department: string
  avatarUrl: string | null
  startDate: string // hireDate as ISO date string
  stage: OnboardingCaseStage
  tasksTotal: number
  tasksCompleted: number
  blockers: number
}
```

---

### `StartOnboardingCaseCommand`

**File:** `application/commands/start-onboarding-case.command.ts`

```ts
export class StartOnboardingCaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly employmentId: string,
    public readonly templateId: string | null,
  ) {}
}
```

**Dependencies injected:** `IOnboardingCaseRepository`, `IOnboardingTemplateRepository`, `IEmploymentRepository`

**Handler** (`start-onboarding-case.handler.ts`) — sequential DB calls:

1. Fetch employment via `IEmploymentRepository.findById` — needed for `employmentType` and `hireDate`
2. Check `IOnboardingCaseRepository.findByEmploymentId` — throw `OnboardingCaseAlreadyExistsException` if found
3. Resolve template (in order):
   - Use `templateId` if provided → fetch via `IOnboardingTemplateRepository.findById`
   - Else `findByEmploymentType` using `employment.employmentType`
   - Else `findDefault`
   - Else throw `NoOnboardingTemplateException`
4. Insert case row (stage = `offer_accepted`, status = `in_progress`)
5. Fetch task templates via `IOnboardingTemplateRepository.getTaskTemplates`
6. Insert one `onboarding_task` per template task (dueDate = `employment.hireDate` + `dueDaysAfterHire` days)

---

## 4. tRPC Interface

**File:** `interface/trpc/people.router.ts` — extend `onboarding` sub-router:

```ts
listCases: publicProcedure
  .input(z.object({ tenantId: z.string().uuid() }))
  .query(({ input }) =>
    svc().query(new ListOnboardingCasesQuery(input.tenantId))
  ),

startCase: publicProcedure
  .input(z.object({
    tenantId: z.string().uuid(),
    actorId: z.string().uuid(),
    employmentId: z.string().uuid(),
    templateId: z.string().uuid().optional(),
  }))
  .mutation(({ input }) =>
    svc().command(
      new StartOnboardingCaseCommand(
        input.tenantId,
        input.actorId,
        input.employmentId,
        input.templateId ?? null,
      )
    )
  ),
```

---

## 5. Frontend

### `types-workflows.ts` update

Add to `OnboardingCase`:

```ts
stage: 'offer_accepted' | 'paperwork' | 'equipment' | 'first_day_ready'
blockers: number
```

---

### `OnboardingKanban` component

**File:** `src/components/onboarding/OnboardingKanban.tsx`

- Fetches `trpc.people.onboarding.listCases` with `useQuery`
- Groups flat list into 4 buckets by `stage`
- Renders a `grid-cols-4` layout

**Column config:**

| Stage key         | Label           | Color     |
| ----------------- | --------------- | --------- |
| `offer_accepted`  | Offer accepted  | `#7170ff` |
| `paperwork`       | Paperwork       | `#06b6d4` |
| `equipment`       | Equipment       | `#f59e0b` |
| `first_day_ready` | First day ready | `#10b981` |

**Column header:** 6px color dot + label + count.

**`OnboardingCaseCard`** (extracted sub-component in same file):

- `AvatarNameCell` with `jobTitle` as subtitle
- Start date row — `Calendar` icon + `startDate` text
- `Progress` bar (`tasksCompleted / tasksTotal * 100`)
- Footer: `{tasksCompleted}/{tasksTotal} tasks` + amber `AlertTriangle` + count when `blockers > 0`
- Entire card clickable → `router.push('/onboarding/' + id)`

**Column footer:** dashed `Button` variant="outline" with `Plus` icon — opens `NewOnboardingDialog`.

**Loading state:** `Skeleton` cards (3 per column) while fetching.

---

### `NewOnboardingDialog` component

**File:** `src/components/onboarding/NewOnboardingDialog.tsx`

A `Dialog` with two fields:

1. **Employee** — `Combobox` from `@future/ui`. Calls `trpc.people.listEmployments` (existing) to populate options. Server rejects duplicate on submit; no client-side pre-filtering needed.
2. **Template** — `Select`. Calls `trpc.people.listOnboardingTemplates` (existing). Shows template name. If only one template exists, pre-select it.

**Submit flow:**

- Calls `trpc.people.onboarding.startCase`
- On success: close dialog + invalidate `listCases` query + success toast
- On `OnboardingCaseAlreadyExistsException`: show inline error below Employee field
- On `NoOnboardingTemplateException`: show inline error below Template field
- Submit button shows `Spinner` while pending

**Props:**

```ts
interface NewOnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

---

### Updated `onboarding/page.tsx`

Remove: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `WorkflowCasesTable`, `WorkflowMyTasks`.

Add:

```tsx
'use client'

export default function OnboardingPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false)

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-2xl font-510 tracking-h2 text-fg-primary">Onboarding</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-1.5" /> New onboarding
        </Button>
      </div>
      <OnboardingKanban />
      <NewOnboardingDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </main>
  )
}
```

---

## 6. Testing

### Backend

**`list-onboarding-cases.handler.spec.ts`**

- Returns enriched list with correct task counts and blockers
- Returns empty array when no active cases exist
- Excludes cases with `status = 'completed'`

**`start-onboarding-case.handler.spec.ts`**

- Happy path: inserts case + tasks, stage = `offer_accepted`
- Throws `OnboardingCaseAlreadyExistsException` when active case exists
- Uses provided `templateId` when given
- Falls back to employment-type template, then default template
- Throws `NoOnboardingTemplateException` when no template resolves

**`drizzle-onboarding.repository.spec.ts`** (extend existing)

- `updateStage` persists stage correctly

### Frontend

**`OnboardingKanban.spec.tsx`**

- Renders 4 columns with correct labels
- Places cards in the correct column by `stage`
- Shows blocker badge when `blockers > 0`, hides when `blockers === 0`
- Navigates to `/onboarding/:id` on card click
- Renders skeletons while loading

**`NewOnboardingDialog.spec.tsx`**

- Renders employee and template selects
- Calls `startCase` with correct payload on submit
- Shows inline error for `OnboardingCaseAlreadyExistsException`
- Closes dialog and invalidates query on success

---

## 7. Out of Scope

- Drag-and-drop to change stage (`updateStage` method wired but no route exposes it)
- "My Tasks" tab (removed; re-add when backend is ready)
- Offboarding — untouched by this spec
