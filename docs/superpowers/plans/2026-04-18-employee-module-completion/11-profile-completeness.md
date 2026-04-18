# Plan 11 — Task 011 Closure (Profile Completeness Configure)

> Covers spec §5 row "Task 011-profile-completeness". No schema dependency.

**Goal:** Add `ConfigureCompletenessCommand` — tenant configures which profile sections are required for "complete" status.

---

## File Map

| File                                                                                      | Action | Purpose                          |
| ----------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| `apps/api/src/modules/people/application/commands/configure-completeness.command.ts`      | Create | Command DTO                      |
| `apps/api/src/modules/people/application/commands/configure-completeness.handler.ts`      | Create | Handler                          |
| `apps/api/src/modules/people/application/commands/configure-completeness.handler.spec.ts` | Create | Unit test                        |
| `apps/api/src/modules/people/domain/repositories/completeness-rule.repository.ts`         | Modify | Add `upsertForTenant` if missing |
| `apps/api/src/modules/people/infrastructure/repositories/completeness-rule.repository.ts` | Modify | Implement                        |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                             | Modify | Expose `completeness.configure`  |
| `apps/api/src/modules/people/people.module.ts`                                            | Modify | Register handler                 |
| `docs/clones/ems/PROGRESS.md`                                                             | Modify | Flip task 011 to `done`          |

---

## Task 1 — Read existing completeness code

- [ ] **Step 1:** Read `completeness-rule.entity.ts`, `completeness-rule.repository.ts` (domain + infra), `GetProfileCompletenessHandler`, `ListIncompleteProfilesHandler`. Note the exact table name and column names.

- [ ] **Step 2:** Read the task spec: `docs/clones/ems/modules/employee/tasks/2026-04-14-011-profile-completeness.md`. Confirm the configure command is just CRUD on the rule table (per-tenant rule list).

---

## Task 2 — `ConfigureCompletenessCommand` (TDD)

- [ ] **Step 1:** Command DTO:

```ts
import type { ProfileSection } from '../../domain/value-objects/profile-section'

export interface CompletenessSectionConfig {
  readonly sectionName: ProfileSection
  readonly required: boolean
  readonly weight: number // 0-100
}

export class ConfigureCompletenessCommand {
  constructor(
    public readonly tenantId: string,
    public readonly sections: CompletenessSectionConfig[],
    public readonly configuredBy: string,
  ) {}
}
```

- [ ] **Step 2:** Spec. Cover:
  - Replaces the tenant's current completeness rule set with the provided list (full replace, not partial merge).
  - Weights sum to 100 → accepted. Weights sum ≠ 100 → throws `ValidationException`.
  - Unknown `sectionName` → throws `UnknownSectionException`.
  - Emits `CompletenessConfiguredEvent` via outbox (add event contract if it doesn't exist).

- [ ] **Step 3:** Implement via `completenessRuleRepo.upsertForTenant(tenantId, sections)`. If the repo doesn't have this method, add it — single transactional write that deletes the tenant's old rules then inserts new ones (both calls sequential inside a Drizzle `transaction` block; transactions can use a single client safely).

- [ ] **Step 4:** Run → PASS. Commit.

---

## Task 3 — tRPC `completeness.configure`

- [ ] **Step 1:** Procedure. Input: `{ sections: Array<{ sectionName: enum, required: bool, weight: number }> }`. Admin-only permission `people.completeness.configure`.

- [ ] **Step 2:** Router spec.

- [ ] **Step 3:** Run → PASS. Commit.

---

## Task 4 — PROGRESS.md + PR

- [ ] Flip row 011 to `done` with PR link.
- [ ] Also update the summary table at top of PROGRESS.md to reflect final state: `11/11 implemented` (assuming bucket 1 + all prior plans also landed).
- [ ] Open PR.

---

## Acceptance criteria

- `completeness.configure` replaces tenant's rule set transactionally.
- Weight validation enforced.
- `CompletenessConfiguredEvent` emitted.
- PROGRESS task 011 = `done`.
- PROGRESS summary table reflects full completion.
