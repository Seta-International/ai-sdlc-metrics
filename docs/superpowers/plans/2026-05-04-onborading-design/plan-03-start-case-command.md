# Plan 3 — StartOnboardingCaseCommand + `startCase` tRPC Route

**Spec:** `docs/superpowers/specs/2026-05-04-onboarding-design.md`
**Depends on:** Plan 1 (needs exceptions, `stage` field on entity, updated `insert`)
**Blocks:** Plan 5 (dialog calls `startCase`)

---

## Goal

Build the command that HR uses to open a new onboarding case for an employee — validates no
duplicate exists, resolves the template, inserts the case, and copies tasks from the template.

---

## Steps

### 3.1 — Command class

**File:** `apps/api/src/modules/people/application/commands/start-onboarding-case.command.ts`

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

---

### 3.2 — Handler

**File:** `apps/api/src/modules/people/application/commands/start-onboarding-case.handler.ts`

Decorate with `@CommandHandler(StartOnboardingCaseCommand)`.
Implement `ICommandHandler<StartOnboardingCaseCommand, void>`.

Inject:

- `@Inject(ONBOARDING_CASE_REPOSITORY) private readonly caseRepo: IOnboardingCaseRepository`
- `@Inject(ONBOARDING_TEMPLATE_REPOSITORY) private readonly templateRepo: IOnboardingTemplateRepository`
- `@Inject(EMPLOYMENT_REPOSITORY) private readonly employmentRepo: IEmploymentRepository`

`execute` body — all DB calls sequential (no `Promise.all`):

**Step 1** — Fetch employment:

```ts
const employment = await this.employmentRepo.findById(employmentId, tenantId)
if (!employment) throw new EmploymentNotFoundException(employmentId)
```

**Step 2** — Guard duplicate:

```ts
const existing = await this.caseRepo.findByEmploymentId(employmentId, tenantId)
if (existing) throw new OnboardingCaseAlreadyExistsException(employmentId)
```

**Step 3** — Resolve template (ordered fallback):

```ts
let template: OnboardingTemplate | null = null
if (templateId) {
  template = await this.templateRepo.findById(templateId, tenantId)
}
if (!template) {
  template = await this.templateRepo.findByEmploymentType(employment.employmentType, tenantId)
}
if (!template) {
  template = await this.templateRepo.findDefault(tenantId)
}
if (!template) throw new NoOnboardingTemplateException(tenantId)
```

**Step 4** — Insert case:

```ts
const newCase = await this.caseRepo.insert({
  tenantId,
  employmentId,
  templateId: template.id,
  status: 'in_progress',
  stage: 'offer_accepted',
})
```

**Step 5** — Fetch task templates:

```ts
const taskTemplates = await this.templateRepo.getTaskTemplates(template.id, tenantId)
```

**Step 6** — Insert one task per template task (sequential `for...of`, NOT `Promise.all`):

```ts
for (const t of taskTemplates) {
  await this.caseRepo.insertTask({
    tenantId,
    caseId: newCase.id,
    actorId,
    title: t.title,
    description: t.description,
    assigneeRole: t.assigneeRole,
    isRequired: t.isRequired,
    dueDate: addDays(employment.hireDate, t.dueDaysAfterHire),
  })
}
```

Define local helper (no library import needed):

```ts
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}
```

---

### 3.3 — Register handler in `PeopleModule`

**File:** `apps/api/src/modules/people/people.module.ts`

- Import `StartOnboardingCaseHandler`
- Add to `providers` array near the other command handlers

---

### 3.4 — tRPC route

**File:** `apps/api/src/modules/people/interface/trpc/people.router.ts`

Inside the `onboarding: router({...})` block, add:

```ts
startCase: publicProcedure
  .input(
    z.object({
      tenantId: z.string().uuid(),
      actorId: z.string().uuid(),
      employmentId: z.string().uuid(),
      templateId: z.string().uuid().optional(),
    }),
  )
  .mutation(({ input }) =>
    svc().command(
      new StartOnboardingCaseCommand(
        input.tenantId,
        input.actorId,
        input.employmentId,
        input.templateId ?? null,
      ),
    ),
  ),
```

Add import at top of file:

```ts
import { StartOnboardingCaseCommand } from '../../../application/commands/start-onboarding-case.command'
```

---

### 3.5 — Spec

**File:** `apps/api/src/modules/people/application/commands/start-onboarding-case.handler.spec.ts`

Use the `vi.fn()` mock-repo pattern. Define factory helpers:

```ts
function makeEmployment(overrides = {}) { ... }
function makeTemplate(overrides = {}) { ... }
function makeTaskTemplate(overrides = {}) { ... }
```

Tests:

- **Test 1 — happy path:**
  `caseRepo.insert` called with `{ stage: 'offer_accepted', status: 'in_progress' }`.
  `caseRepo.insertTask` called N times matching template task count.

- **Test 2 — throws `OnboardingCaseAlreadyExistsException`:**
  `findByEmploymentId` returns an existing case → handler throws.

- **Test 3 — uses provided `templateId`:**
  `templateId` given → `templateRepo.findById` called with that id; `findByEmploymentType`
  and `findDefault` NOT called.

- **Test 4 — falls back to employment-type template:**
  No `templateId` given, `findById` not called, `findByEmploymentType` returns a template.

- **Test 5 — falls back to default template:**
  `findByEmploymentType` returns `null` → `findDefault` called and returns template.

- **Test 6 — throws `NoOnboardingTemplateException`:**
  All three template lookups return `null` → handler throws.

- **Test 7 — dueDate calculation:**
  Template task has `dueDaysAfterHire: 7`, employment `hireDate: 2026-05-01`.
  Assert `insertTask` called with `dueDate` equal to `2026-05-08`.

---

## Risks

- The `IOnboardingCaseRepository.insert` method signature currently takes
  `Omit<OnboardingCase, 'id' | 'createdAt' | 'updatedAt'>`. After Plan 1 adds `stage` to
  `OnboardingCase`, the `insert` call must include `stage: 'offer_accepted'` — verify the
  type compiles with the explicit field.
