# 05 — Permissions Model

## Two layers

| Layer                    | Source                            | Purpose                                      |
| ------------------------ | --------------------------------- | -------------------------------------------- |
| **Tenant capability**    | `kernel.role_permission` registry | Can this actor do X in this tenant at all?   |
| **Plan membership role** | `planner.plan_member.role`        | Within this specific plan, what can they do? |

Both must pass.

## Permissions registered in kernel (Phase 1)

```
planner.plan.create
planner.plan.delete-any
planner.plan.read-any              # platform_admin, insights
planner.plan.manage-members-any    # reserved for future bulk ops
planner.task.complete-any          # admin override
```

Default grants: tenant_admin gets all; member gets `planner.plan.create`; `platform_admin` gets `read-any`. Seeded via kernel's registry migration pattern.

## Plan membership roles

| Role     | Read | Create/edit tasks | Manage buckets/labels | Add/remove members | Delete plan |
| -------- | ---- | ----------------- | --------------------- | ------------------ | ----------- |
| `owner`  | ✓    | ✓                 | ✓                     | ✓                  | ✓           |
| `editor` | ✓    | ✓                 | ✓                     | ✗                  | ✗           |
| `viewer` | ✓    | ✗                 | ✗                     | ✗                  | ✗           |

Any plan member can **comment and submit evidence** on tasks they can see (viewer included).

**Viewer-assignee exception:** A viewer assigned to a task can update **their own** progress on that task (NotStarted → InProgress → Completed) — but not other fields.

## Where checks live

```
tRPC router
  -> handler
      -> PlanAuthorizationService (the single source of auth logic)
          -> KernelQueryFacade.hasPermission(actorId, capability)
          -> planRepo.getMemberRole(planId, actorId)
```

Service surface:

```ts
assertCanCreatePlan(actorId)
assertCanReadPlan(actorId, planId)
assertCanEditPlan(actorId, planId) // >= editor
assertCanAdminPlan(actorId, planId) // owner
assertCanManageMembers(actorId, planId) // owner
assertCanEditTask(actorId, taskId) // resolves task -> plan
assertCanUpdateOwnTaskProgress(actorId, taskId) // viewer-assignee exception
assertCanCommentOnTask(actorId, taskId) // any member
```

Every mutation handler calls exactly one assertion up front.

## Repository-level enforcement

`DrizzlePlanRepository.findForActor(actorId)` always joins `plan_member` (plus `OR exists` on `read-any`). Zero-trust reads: even if a handler forgets to check, the repo won't return unauthorized rows.

## `platform_admin` and `web-admin`

- `platform_admin` gets `planner.plan.read-any`.
- Phase 1 ships **no** SETA-operator UI for planner. Platform admins use API with elevated auth.

## Guest access

Not in Phase 1. Blocker for Phase 4 import of MS plans with external guests: `pending_ms_assignments` holds unresolved AAD IDs until `identity` adds a guest-actor type (separate future feature).

## Delegation (kernel feature)

Kernel delegation (e.g., CEO → EA) passes through `KernelQueryFacade.hasPermission` transparently. Nothing extra for `planner`.

## Audit trail

Every permission-gated mutation emits its outbox event with `actorId` (performer). Auditors trace via `insights`.
