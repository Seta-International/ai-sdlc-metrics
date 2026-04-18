# 01 — Architecture (DDD Module Layout)

Following CLAUDE.md's Hexagonal + DDD rules strictly. One module (`planner`) with one schema (`planner`). Exactly one exported facade.

## Directory structure

```
apps/api/src/modules/planner/
├── domain/
│   ├── entities/
│   │   ├── plan.entity.ts              # aggregate root
│   │   ├── bucket.entity.ts            # child of plan
│   │   ├── task.entity.ts              # aggregate root (MS treats tasks as top-level)
│   │   ├── label.entity.ts
│   │   ├── checklist-item.value-object.ts
│   │   ├── task-attachment.entity.ts
│   │   ├── task-comment.entity.ts
│   │   ├── task-evidence.entity.ts
│   │   └── task-assignee.value-object.ts
│   ├── value-objects/
│   │   ├── progress.vo.ts              # 0 | 50 | 100 (MS shape)
│   │   ├── priority.vo.ts              # 1 | 3 | 5 | 9 (MS shape)
│   │   ├── ms-order-hint.vo.ts         # MS-compatible ordering
│   │   ├── label-slot.vo.ts            # 'category1'..'category25'
│   │   └── plan-container.vo.ts        # { type: 'group'|'roster'|'none', externalId? }
│   ├── repositories/                   # interfaces only; no .port suffix (CLAUDE.md rule)
│   │   ├── plan.repository.ts
│   │   ├── bucket.repository.ts
│   │   ├── task.repository.ts
│   │   ├── task-attachment.repository.ts
│   │   ├── task-comment.repository.ts
│   │   └── task-evidence.repository.ts
│   ├── ports/
│   │   └── ms-planner-client.port.ts   # defined, unimplemented in Phase 1 (Phase 4 wires)
│   ├── events/
│   │   └── index.ts                    # re-exports from @future/event-contracts
│   └── exceptions/
│       ├── plan-not-found.exception.ts
│       ├── task-not-found.exception.ts
│       ├── bucket-limit-reached.exception.ts
│       ├── label-limit-reached.exception.ts          # 25 per plan
│       ├── checklist-limit-reached.exception.ts      # 20 per task
│       ├── description-too-long.exception.ts         # 32 000 chars
│       ├── concurrent-modification.exception.ts
│       └── unauthorized-plan-access.exception.ts
├── application/
│   ├── commands/
│   │   ├── plans/          # create, rename, delete, add-member, remove-member
│   │   ├── buckets/        # create, rename, reorder, delete
│   │   ├── tasks/          # create, update, move, set-progress, set-priority, set-dates,
│   │   │                   # assign, unassign, apply-label, remove-label, delete
│   │   ├── checklist/      # add-item, update-item, toggle-item, remove-item
│   │   ├── attachments/    # request-upload, finalize-upload, set-cover, remove
│   │   ├── comments/       # post, delete (soft)
│   │   ├── evidence/       # request-upload, finalize-upload, create-note, create-link, remove
│   │   └── labels/         # rename-plan-label, recolor-plan-label
│   ├── queries/
│   │   ├── get-plan.handler.ts
│   │   ├── list-plans-for-actor.handler.ts
│   │   ├── get-board.handler.ts                      # plan + buckets + tasks in one snapshot
│   │   ├── get-task-detail.handler.ts
│   │   ├── list-task-comments.handler.ts
│   │   └── list-task-evidence.handler.ts
│   ├── event-handlers/
│   │   └── on-task-assigned.handler.ts               # enqueues notification job
│   ├── services/
│   │   └── plan-authorization.service.ts             # wraps Kernel calls; single source of auth logic
│   └── facades/
│       └── planner-query.facade.ts                   # ONLY export of this module
├── infrastructure/
│   ├── repositories/                                 # Drizzle implementations of domain repos
│   ├── schema/
│   │   └── planner.schema.ts                         # Drizzle tables, RLS, constraints
│   ├── ms-graph/                                     # empty in Phase 1; reserved for Phase 4
│   │   └── .gitkeep
│   └── listeners/
│       └── .gitkeep
├── interface/
│   └── trpc/
│       ├── plan.router.ts
│       ├── bucket.router.ts
│       ├── task.router.ts
│       ├── checklist.router.ts
│       ├── attachment.router.ts
│       ├── comment.router.ts
│       ├── evidence.router.ts
│       ├── label.router.ts
│       └── index.ts                                  # composes into plannerRouter
├── testing/
│   ├── build-plan.ts
│   ├── build-task.ts
│   └── with-tenant.ts
└── planner.module.ts                                 # exports: [PlannerQueryFacade] only
```

## Cross-module import rules (ESLint-enforced)

| Direction                                                                                                    | Allowed? |
| ------------------------------------------------------------------------------------------------------------ | -------- |
| `planner.application` → `IdentityQueryFacade`, `PeopleQueryFacade`, `KernelQueryFacade`                      | Yes      |
| `planner.infrastructure` → `@future/storage`, `@future/event-contracts`                                      | Yes      |
| `planner.domain` → anything outside `planner.domain`                                                         | **No**   |
| Any module → `planner.domain.*` or `planner.infrastructure.*` or `planner.application.*` (except the facade) | **No**   |

## Module exports (Phase 1 surface)

Exactly one class: `PlannerQueryFacade`. Phase 1 methods (kept minimal, grow as consumers need):

- `countOpenTasksForActor(actorId): Promise<number>`
- `listPlansForActor(actorId): Promise<PlanSummary[]>`

No write facade in Phase 1. Cross-module writes not needed until Sub-project #5.

## Event contracts added to `packages/event-contracts`

Plain TypeScript, zero Nest deps. Published via outbox.

```
TaskCreatedEvent, TaskAssignedEvent, TaskUnassignedEvent, TaskCompletedEvent,
TaskMovedEvent, TaskPriorityChangedEvent, TaskDueDateChangedEvent,
TaskDeletedEvent, TaskCommentPostedEvent, TaskCommentDeletedEvent,
TaskEvidenceSubmittedEvent, (TaskEvidenceVerifiedEvent reserved for Phase 5),
PlanCreatedEvent, PlanRenamedEvent, PlanDeletedEvent,
PlanMemberAddedEvent, PlanMemberRemovedEvent,
BucketCreatedEvent, BucketRenamedEvent, BucketReorderedEvent, BucketDeletedEvent
```

All carry `{ tenantId, actorId (performer), <entityId>, <changed fields>, occurredAt }`.

## Outbox consumers

Phase 1 emits events but only `notifications` consumes them (for the task-assigned email). `insights` and the Phase 4 MS sync relay subscribe later.

## DDD red flags explicitly avoided

- ❌ Repository tokens in module `exports`
- ❌ Importing `drizzle-*.repository.ts` from another module
- ❌ Domain entities being Drizzle row shapes (domain stays pure; mappers in `infrastructure`)
- ❌ `useValue: {}` stubs for MS Graph port — the port throws "Sync not enabled" until Phase 4 wires the real adapter. No silent no-ops.
- ❌ `Promise.all` for DB reads inside handlers (RLS single-client rule)
