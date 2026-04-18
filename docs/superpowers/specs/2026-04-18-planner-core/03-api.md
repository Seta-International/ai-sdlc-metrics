# 03 — tRPC API Surface

Composed at `apps/api/src/modules/planner/interface/trpc/index.ts`:

```
plannerRouter
├── plans, buckets, tasks, checklist, attachments, comments, evidence, labels
```

Routers are thin: zod-parse input, resolve auth context, dispatch to Nest CQRS handler.

## The Board read — single snapshot

```ts
tasks.getBoard(input: { planId: string }) -> {
  plan:    { id, name, description, labels: Label[], members: PlanMember[], container, msPlanId?, updatedAt },
  buckets: Bucket[],                                // sorted by orderHint
  tasks:   Array<{
    id, bucketId, title, progress, priority, startDate, dueDate,
    orderHint, checklistItemCount, checklistCheckedCount, coverAttachmentId,
    appliedLabels: LabelSlot[],
    assignees: Array<{ actorId, displayName, avatarUrl }>,  // PeopleQueryFacade batch-resolved
    attachmentCount, commentCount, evidenceCount,
    msTaskId?, updatedAt,
  }>                                                // sorted by bucketId, orderHint
}
```

- Three underlying SQL queries (plan+labels+members, buckets, tasks). No N+1.
- Assignee display names resolved via one `PeopleQueryFacade.getActorsByIds(actorIds)` batch.
- Counts are `count(*)` aggregates in the same SQL as the task query.
- Task description, full checklist, attachments, comments, evidence loaded only when the user opens a task.

## Task detail reads

```
tasks.getDetail({ taskId }) -> { task, checklist, attachments, assignees (rich) }
comments.list({ taskId, cursor? }) -> paginated TaskComment[], newest first
evidence.list({ taskId }) -> TaskEvidence[]
```

## Command shape — optimistic concurrency via `expectedVersion`

Every mutation on existing entities takes `expectedVersion: string` (the current `updatedAt` ISO). Handler compares; mismatch → `ConcurrentModificationException` → tRPC `CONFLICT`. Client refetches and retries.

This is orthogonal to MS etag concurrency, which Phase 4 layers on at the sync boundary.

```ts
tasks.create(input: {
  planId: string
  bucketId: string
  title: string
  description?: string
  priority?: Priority
  startDate?: Date
  dueDate?: Date
  assigneeActorIds?: string[]
  appliedLabels?: LabelSlot[]
  orderHintAfter?: string          // insert after this hint; server computes via MsOrderHint.between()
}) -> Task

tasks.update(input: {
  taskId: string
  patch: Partial<{ title, description, priority, startDate, dueDate, progress }>
  expectedVersion: string          // updatedAt ISO
}) -> Task
```

## Move / reorder

```ts
tasks.move({ taskId, toBucketId, orderHintAfter?, orderHintBefore?, expectedVersion }) -> Task
buckets.reorder({ bucketId, orderHintAfter?, orderHintBefore?, expectedVersion }) -> Bucket
```

Server computes final `orderHint` via `MsOrderHint.between(before, after)`. Client never invents order hints.

## Group-by drag-drop → field mutations

When the Board is grouped by something other than Bucket, the frontend dispatches the correct command:

| Grouped by | Drag calls                                          |
| ---------- | --------------------------------------------------- |
| Bucket     | `tasks.move(toBucketId: X)`                         |
| Progress   | `tasks.setProgress(progress: X)`                    |
| Priority   | `tasks.setPriority(priority: X)`                    |
| Due date   | `tasks.setDates(dueDate: X)`                        |
| Assignee   | `tasks.assign(actorId: X)` (with separate unassign) |
| Label      | `tasks.applyLabel(slot: X)` (with separate remove)  |

The group-by picker UI is Sub-project #2, but the backend commands for all grouping dimensions ship in Phase 1 so drag-drop works when Sub-project #2 surfaces the picker.

## Attachments — presigned upload (two-step)

```
attachments.requestUpload({ taskId, filename, contentType, sizeBytes })
  -> { uploadUrl, storageKey, expiresAt }
attachments.finalizeUpload({ taskId, storageKey, filename, contentType, sizeBytes, setAsCover? })
  -> TaskAttachment
```

Evidence uses identical `evidence.requestUpload` / `evidence.finalizeUpload` + `caption` field. Link attachments / evidence are single-call (no S3).

## Input validation — zod at the boundary

Every input zod-parsed with MS caps encoded:

```ts
const CreateTaskInput = z.object({
  planId: z.string().uuid(),
  bucketId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(32_000).optional(),
  priority: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]).optional(),
  // ...
})
```

Caps enforced twice (zod + domain entity) — cheap edge rejection + authoritative invariant guard.

## Error → tRPC mapping

| Exception                                               | tRPC code             | HTTP |
| ------------------------------------------------------- | --------------------- | ---- |
| `*NotFoundException`                                    | `NOT_FOUND`           | 404  |
| `*LimitReachedException`, `DescriptionTooLongException` | `PRECONDITION_FAILED` | 412  |
| `ConcurrentModificationException`                       | `CONFLICT`            | 409  |
| `UnauthorizedPlanAccessException`                       | `FORBIDDEN`           | 403  |
| zod validation                                          | `BAD_REQUEST`         | 400  |

## Not shipped in Phase 1

- Bulk operations
- `plans.copy`
- `plans.export` to Excel
- `tasks.search` (browser-side filtering over Board snapshot suffices)
