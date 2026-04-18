# Plan 01 — Foundation + Plans & Members

> Covers spec phases: **Pre-1.0, 1.0, 1.1** — see [progress.md](../../specs/2026-04-18-planner-core/progress.md).

**Goal:** Scaffold the `planner` module, apply the full schema migration, build the domain aggregates and invariants, wire permissions, and ship plan + member + label CRUD behind a feature flag. No tasks yet — those come in Plan 02.

**Architecture:** Hexagonal + DDD (CLAUDE.md). One module (`planner`), one schema (`planner`), one exported facade (`PlannerQueryFacade`). Domain stays pure; Drizzle in infrastructure; tRPC in interface. Cross-module reads via other modules' QueryFacades.

**Tech stack:** NestJS, Drizzle ORM, PostgreSQL 16 with RLS, tRPC, zod, Next.js 15 (zone), Vitest + Jest, Testcontainers.

---

## File Map

| File                                                                               | Action  | Purpose                                                                                                      |
| ---------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/identity/application/facades/identity-query.facade.ts`       | Modify  | Add `getExternalUserId` / `getActorIdByExternalUserId`                                                       |
| `apps/api/src/modules/identity/infrastructure/schema/identity.schema.ts`           | Modify  | Add `external_user_id` column on `identity.user`                                                             |
| `packages/db/src/migrations/NNNN_identity_external_user_id.sql`                    | Create  | New migration for identity column                                                                            |
| `apps/api/src/modules/planner/domain/value-objects/*.ts`                           | Create  | `MsOrderHint`, `Progress`, `Priority`, `LabelSlot`, `PlanContainer`                                          |
| `apps/api/src/modules/planner/domain/entities/*.ts`                                | Create  | `Plan`, `Bucket`, `Label`, `PlanMember`, `TaskAssignee` VO (stubs only — tasks filled in Plan 02)            |
| `apps/api/src/modules/planner/domain/repositories/*.ts`                            | Create  | Repository interfaces                                                                                        |
| `apps/api/src/modules/planner/domain/ports/ms-planner-client.port.ts`              | Create  | Empty port; throws in Phase 1                                                                                |
| `apps/api/src/modules/planner/domain/exceptions/*.ts`                              | Create  | All exception classes                                                                                        |
| `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`             | Create  | Drizzle tables for all entities, with `task_*` stubs                                                         |
| `packages/db/src/migrations/NNNN_planner_core_schema.sql`                          | Create  | One big migration: every table + RLS + indexes + constraints                                                 |
| `apps/api/src/modules/planner/infrastructure/repositories/*.ts`                    | Create  | Drizzle repos for plan, bucket, label, plan-member                                                           |
| `apps/api/src/modules/planner/application/services/plan-authorization.service.ts`  | Create  | Single source of auth logic                                                                                  |
| `apps/api/src/modules/planner/application/commands/plans/*.handler.ts`             | Create  | create, rename, delete, add-member, remove-member                                                            |
| `apps/api/src/modules/planner/application/commands/labels/*.handler.ts`            | Create  | rename-plan-label, recolor-plan-label                                                                        |
| `apps/api/src/modules/planner/application/queries/get-plan.handler.ts`             | Create  | Single plan read                                                                                             |
| `apps/api/src/modules/planner/application/queries/list-plans-for-actor.handler.ts` | Create  | Plans the actor can see                                                                                      |
| `apps/api/src/modules/planner/application/facades/planner-query.facade.ts`         | Create  | `countOpenTasksForActor` (returns 0 stub), `listPlansForActor`                                               |
| `apps/api/src/modules/planner/interface/trpc/{plan,label}.router.ts`               | Create  | tRPC procedures                                                                                              |
| `apps/api/src/modules/planner/interface/trpc/index.ts`                             | Create  | Compose `plannerRouter`                                                                                      |
| `apps/api/src/modules/planner/planner.module.ts`                                   | Replace | Real module; exports only `PlannerQueryFacade`                                                               |
| `apps/api/src/app.router.ts` (or wherever AppRouter lives)                         | Modify  | Mount `plannerRouter` at `/planner`                                                                          |
| `apps/api/src/modules/kernel/infrastructure/seeds/permissions.seed.ts`             | Modify  | Register `planner.plan.*` + `planner.task.complete-any`                                                      |
| `packages/event-contracts/src/planner/*.ts`                                        | Create  | `PlanCreatedEvent`, `PlanRenamedEvent`, `PlanDeletedEvent`, `PlanMemberAddedEvent`, `PlanMemberRemovedEvent` |
| `apps/api/src/modules/planner/testing/{build-plan,with-tenant}.ts`                 | Create  | Shared fixtures                                                                                              |
| `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts`                 | Modify  | Add `planner_core_enabled` feature flag column on tenant settings (or whatever existing flag table)          |
| `apps/web-planner/src/app/layout.tsx`                                              | Replace | Shell + `<GlobalNav/>`                                                                                       |
| `apps/web-planner/src/app/page.tsx`                                                | Replace | Redirect to `/plans`                                                                                         |
| `apps/web-planner/src/app/plans/page.tsx`                                          | Create  | List of plans visible to actor                                                                               |
| `apps/web-planner/src/app/plans/new/page.tsx`                                      | Create  | Create-plan flow                                                                                             |
| `apps/web-planner/src/app/plans/[planId]/layout.tsx`                               | Create  | Plan context loader                                                                                          |
| `apps/web-planner/src/app/plans/[planId]/page.tsx`                                 | Create  | Redirects to `/board` — empty placeholder in this plan                                                       |
| `apps/web-planner/src/app/plans/[planId]/settings/page.tsx`                        | Create  | Plan settings drawer: rename, delete, members, labels                                                        |
| `apps/web-planner/src/lib/trpc.ts`, `lib/hooks/usePlanMembership.ts`               | Create  | tRPC client + hook                                                                                           |

---

## Task 1 — Identity module prerequisite PR

Ship this as a separate PR, merged **before** any planner work begins.

- [ ] **Step 1:** Add column

```sql
alter table identity.user
  add column external_user_id text null;
create unique index identity_user_external_uidx
  on identity.user (tenant_id, provider_type, external_user_id)
  where external_user_id is not null;
```

- [ ] **Step 2:** Update Drizzle schema to reflect the column.
- [ ] **Step 3:** Add methods to `IdentityQueryFacade`:

```ts
getExternalUserId(actorId: ActorId): Promise<string | null>;
getActorIdByExternalUserId(aadUserId: string, tenantId: TenantId): Promise<ActorId | null>;
```

Implementations are thin repository calls. Phase 1 planner code won't call them — signatures must exist so Phase 4 is a drop-in.

- [ ] **Step 4:** Unit test both methods against an in-memory fake. Integration test against Testcontainers.
- [ ] **Step 5:** Open PR; merge before Plan 01 continues.

Acceptance: PR merged to main; `git log --oneline --grep=external_user_id -1` shows the commit.

---

## Task 2 — Scaffold `planner` module directory layout

- [ ] **Step 1:** Run `bunx nest g module planner --no-spec` from `apps/api`. Move the generated file under `src/modules/planner/planner.module.ts`.
- [ ] **Step 2:** Create the directory skeleton per [spec §01-architecture.md](../../specs/2026-04-18-planner-core/01-architecture.md). Drop `.gitkeep` in empty folders.
- [ ] **Step 3:** Add ESLint module-boundary rules in `packages/eslint-config/*`:
  - `planner.domain` can import only from `planner.domain/**`.
  - Other modules can import only `planner/planner.module` and `planner/application/facades/planner-query.facade`.
- [ ] **Step 4:** Confirm the rule fires: create a probe import `planner/infrastructure/x.ts` from another module and watch ESLint fail. Remove probe.

Acceptance: `bun run lint` passes; a probe import from outside `planner`'s allowed surface produces an ESLint error.

---

## Task 3 — Value objects (TDD)

Write the spec first. Implementation file should not exist until the test fails for the right reason.

- [ ] **Step 1:** `ms-order-hint.vo.spec.ts`
  - `between(undefined, undefined)` returns MS's "middle" baseline.
  - `between(a, undefined)` returns a hint sorting after `a`.
  - `between(undefined, b)` returns a hint sorting before `b`.
  - `between(a, b)` returns a hint with `a < hint < b` lexicographically.
  - Repeated `between('x', y)` 1000 times; resulting hint length stays under the documented ceiling.
  - Round-trip: golden fixtures from MS docs — each computed hint matches byte-for-byte.
  - Throws on malformed input.
- [ ] **Step 2:** Implement `MsOrderHint` class per [MS algorithm](https://learn.microsoft.com/en-us/graph/api/resources/planner-order-hint-format). Keep the algorithm pure (no dependencies).
- [ ] **Step 3:** Specs for `Progress` (0/50/100 only, throws on other), `Priority` (1/3/5/9 only), `LabelSlot` (category1..category25 only), `PlanContainer` (XOR on group/roster/none).
- [ ] **Step 4:** Mirror the `MsOrderHint` implementation to `apps/web-planner/src/lib/order-hint.ts` and re-run the same golden fixture tests in Vitest to guarantee client/server parity.

Acceptance: `bun run test:unit --filter planner/domain/value-objects` green. Client and server fixtures agree.

---

## Task 4 — Drizzle schema + migration

- [ ] **Step 1:** In `planner.schema.ts`, declare all tables from [spec §02 Tables](../../specs/2026-04-18-planner-core/02-domain-and-schema.md#tables). Use Drizzle's `pgSchema('planner')` per module-schema pattern. Include CHECK constraints, partial unique indexes, and composite indexes.
- [ ] **Step 2:** Generate migration: `bun run --filter @future/db drizzle:generate`. Inspect. Hand-edit to add:
  - `alter table planner.<t> enable row level security` for every table.
  - `create policy <t>_tenant_isolation ...` for every table, matching the existing pattern in people/time schemas.
- [ ] **Step 3:** Spec: new integration test `planner-schema.integration.spec.ts` using Testcontainers that asserts:
  - Every table has RLS enabled (`pg_class.relrowsecurity = true`).
  - Inserts from tenant A are invisible in a session scoped to tenant B.
  - All CHECK constraints reject bad values (progress=42, label slot `category26`, negative description length, invalid `task_attachment.kind` combinations, evidence XOR, etc.).
- [ ] **Step 4:** `bun run --filter @future/db migrate:test` and confirm the migration applies cleanly on a fresh Postgres 16 and is idempotent.

Acceptance: Migration applies; integration spec passes; all CHECK constraints exercised.

---

## Task 5 — Aggregates and invariants (TDD)

- [ ] **Step 1:** `plan.entity.spec.ts`:
  - Cannot have more than 25 labels → `LabelLimitReachedException`.
  - Label slot IDs match pattern `category1..category25`.
  - Must have ≥1 owner.
  - Bucket orderHints stay monotonic after reorder.
  - Description >32 000 throws `DescriptionTooLongException`.
- [ ] **Step 2:** Implement `Plan` aggregate with private setters; mutations go through methods (`renameTo`, `recolorLabel`, `addMember`, `removeMember`, `addBucket`, `reorderBucket`).
- [ ] **Step 3:** `bucket.entity.spec.ts` + implementation (rename, reorder with hint math).
- [ ] **Step 4:** Placeholder `task.entity.ts` — minimal shell satisfying repository interface. Full implementation in Plan 02.

Acceptance: Domain specs green. No NestJS or Drizzle imports inside `domain/`.

---

## Task 6 — Repositories (interfaces + Drizzle implementations + in-memory fakes)

- [ ] **Step 1:** Interfaces in `domain/repositories/` for `plan`, `bucket`, `label`, `plan-member` (task repo stubbed for Plan 02).
- [ ] **Step 2:** Drizzle impls in `infrastructure/repositories/`. Every read filters `deleted_at IS NULL` by default. Mappers convert Drizzle rows ↔ domain entities in `infrastructure/repositories/mappers/`.
- [ ] **Step 3:** In-memory fakes in `testing/fakes/` implementing the same interfaces. Used by handler unit tests.
- [ ] **Step 4:** Integration spec for each repo: create, read, soft-delete, hard-cascade, list-by-tenant. Assert RLS filters tenant B's rows even when the session variable is wrong.

Acceptance: Every repo method covered by integration spec. Handler unit tests can use fakes exclusively.

---

## Task 7 — `PlanAuthorizationService` and kernel permissions

- [ ] **Step 1:** Seed kernel permissions in `kernel/infrastructure/seeds/permissions.seed.ts`:

```
planner.plan.create
planner.plan.delete-any
planner.plan.read-any
planner.plan.manage-members-any
planner.task.complete-any
```

Grants: `tenant_admin` → all; `member` role → `planner.plan.create`; `platform_admin` → `planner.plan.read-any`.

- [ ] **Step 2:** `plan-authorization.service.spec.ts`. Each assertion:
  - Throws `UnauthorizedPlanAccessException` when the actor lacks both tenant capability and plan membership.
  - Passes when actor is owner / editor / viewer with appropriate scope.
  - Honors viewer-assignee exception for `assertCanUpdateOwnTaskProgress`.
  - Delegation: a delegated capability is honored via `KernelQueryFacade.hasPermission`.
- [ ] **Step 3:** Implement. Injects `KernelQueryFacade` and `PlanRepository`. Exactly 8 methods per spec §05.

Acceptance: `PlanAuthorizationService` specs green; every assertion has its dedicated test.

---

## Task 8 — Plan CRUD + member + label command handlers

Each handler is its own file with a co-located `.spec.ts`. Every spec covers: happy path, authorization reject, validation failure modes, outbox event emission.

- [ ] **Step 1:** `create-plan.handler.ts` — creates empty plan, seeds one "To do" bucket, auto-adds caller as owner, emits `PlanCreatedEvent`.
- [ ] **Step 2:** `rename-plan.handler.ts` — optimistic concurrency via `expectedVersion`; emits `PlanRenamedEvent`.
- [ ] **Step 3:** `delete-plan.handler.ts` — soft delete; owner-only; emits `PlanDeletedEvent`.
- [ ] **Step 4:** `add-plan-member.handler.ts` / `remove-plan-member.handler.ts` — owner-only; cannot remove last owner; emits events.
- [ ] **Step 5:** `rename-plan-label.handler.ts` / `recolor-plan-label.handler.ts` — upserts a `plan_label` row for the slot if absent; editor+ scope.
- [ ] **Step 6:** Integration specs in `plans.integration.spec.ts` covering the full command pipeline through tRPC + real DB.

Acceptance: All handler unit specs green. Integration spec exercises the full pipeline.

---

## Task 9 — Query handlers + `PlannerQueryFacade` skeleton

- [ ] **Step 1:** `list-plans-for-actor.handler.ts` — returns plans where actor is a member OR actor has `planner.plan.read-any`. Result is `{id, name, memberCount, myRole, updatedAt}[]`.
- [ ] **Step 2:** `get-plan.handler.ts` — full plan with labels and members, auth-checked.
- [ ] **Step 3:** `PlannerQueryFacade` implementing:
  - `listPlansForActor(actorId) → PlanSummary[]` (delegates to the query handler).
  - `countOpenTasksForActor(actorId) → Promise<number>` — stub returning `0` for now (task-filled in Plan 02).
- [ ] **Step 4:** Facade spec covering both methods.

Acceptance: Facade exported; only facade re-exported from `PlannerModule`.

---

## Task 10 — tRPC routers

- [ ] **Step 1:** `plan.router.ts`:
  - `list: query` → `listPlansForActor`
  - `get: query` → `getPlan`
  - `create: mutation`
  - `rename: mutation`
  - `delete: mutation`
  - `addMember: mutation` / `removeMember: mutation`
- [ ] **Step 2:** `label.router.ts`: `rename`, `recolor`.
- [ ] **Step 3:** `index.ts` composes `plannerRouter`. Mount in `AppRouter` at `/planner`.
- [ ] **Step 4:** Exception → tRPC error mapping helper; reuse across all planner routers.
- [ ] **Step 5:** Integration spec that exercises each procedure via `@trpc/client` against the test stack.

Acceptance: `curl`-level integration test for each procedure returns correct shapes and status codes.

---

## Task 11 — Feature flag

- [ ] **Step 1:** Add `planner_core_enabled` boolean (default false) to the existing tenant-settings table in `admin` schema.
- [ ] **Step 2:** In the tRPC context middleware, when the tenant lacks the flag, throw `FORBIDDEN` on any `plannerRouter.*` procedure.
- [ ] **Step 3:** Turn the flag on for the SETA internal tenant via a seed migration (keeps dogfooding path clear).
- [ ] **Step 4:** Spec: calling `plans.list` from a tenant without the flag returns 403.

Acceptance: Flag gates the zone. Internal tenant bypassed.

---

## Task 12 — `web-planner` zone shell + plans pages

- [ ] **Step 1:** Zone layout with `<GlobalNav/>` from `@future/ui`. tRPC client wired via `proxy.ts` (same pattern as other zones).
- [ ] **Step 2:** `/plans` page fetches `plans.list`, renders a simple grid of plan cards (name, member count). Empty state: "Create your first plan."
- [ ] **Step 3:** `/plans/new` — simple dialog: plan name, optional description, submit → `plans.create` → redirect to `/plans/:id/board` (which will render "Board coming in Plan 02" placeholder).
- [ ] **Step 4:** `/plans/:id/settings` drawer with three sections: Details (rename, delete), Members (list + add/remove picker using `PeopleQueryFacade` search), Labels (25-slot grid with rename + recolor).
- [ ] **Step 5:** All frontend calls go through React Query with sensible cache keys. No optimistic updates yet — spinners are fine in Plan 01.
- [ ] **Step 6:** Vitest + RTL component specs for `LabelEditor` (25 slots, rename applies, recolor applies).

Acceptance: User with the flag on can create a plan, invite a teammate, rename a label, delete the plan. All via the zone.

---

## Task 13 — E2E smoke (Playwright)

One flow only at this stage; the rest land in Plan 05.

- [ ] Sign in → `/plans` empty → create plan → settings → add member → rename label → delete plan → back to empty.

Acceptance: Playwright green locally against docker-compose stack.

---

## Task 14 — CI gates and coverage

- [ ] Confirm coverage ≥70% on new code. If below, add missing branch tests before wrapping.
- [ ] Module-boundary ESLint rule fires on intentional probe violations.
- [ ] No `.js` extensions in any new relative import.
- [ ] No `__tests__/` dirs introduced.
- [ ] No `Promise.all` for DB queries.

Acceptance: All CI checks green on the PR.

---

## Deliverable

One PR (or a stack of PRs landing in order) that:

1. Ships identity prerequisite (Task 1) — separate PR merged first.
2. Completes Tasks 2–14 — the planner module scaffolding + plans/members/labels slice behind the feature flag.
3. Updates the spec's `progress.md` checkboxes for Phase 1.0 and Phase 1.1.
